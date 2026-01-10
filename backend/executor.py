import ast
import time

class ScriptError(Exception):
    def __init__(self, node, message):
        self.lineno = getattr(node, "lineno", None)
        self.message = message
        super().__init__(self.__str__())

    def __str__(self):
        if self.lineno:
            return f"Line {self.lineno}: {self.message}"
        return self.message

class Executor:
    MAX_STEPS = 200
    MAX_TIMEOUT = 1800
    TIME_PER_STEP = 1.0
    
    def __init__(self, tree, farm, is_manual = False):
        self.stack = list(reversed(tree.body))
        self.ctx = {}
        self.farm = farm
        self.steps = 0
        
        # mark start time only if all script runs automatically in one batch
        self.start_time = None if is_manual else time.time()

    def step(self):
        if not self.stack:
            return None  # terminate code execution
        
        self.steps += 1
        node = self.stack.pop()
        
        if self.start_time and time.time() - self.start_time > self.MAX_TIMEOUT:
            raise ScriptError(node, "Script timeout")
        
        if self.steps > self.MAX_STEPS:
            raise ScriptError(node, "Script exceeded maximum execution steps")
        
        # farm time elapses 1 second for each execution step
        self.farm.tick(self.TIME_PER_STEP)
        
        # if / else
        if isinstance(node, ast.If):
            condition = self.eval(node.test)
            body = node.body if condition else node.orelse
            for stmt in reversed(body):
                self.stack.append(stmt)
            return self.step()
            
        # for loop
        if isinstance(node, ast.For):
            iterable = self.eval(node.iter)
            target = node.target.id

            for value in reversed(iterable):
                for stmt in reversed(node.body):
                    self.stack.append(stmt)
                self.stack.append(
                    ast.Assign(
                        targets=[ast.Name(id=target, ctx=ast.Store())],
                        value=ast.Constant(value=value)
                    )
                )
            return self.step()

        # assignment
        if isinstance(node, ast.Assign):
            value = self.eval(node.value)
            self.ctx[node.targets[0].id] = value
            return self.step()

        # expr(function call)
        if isinstance(node, ast.Expr):
            return self.exec_expr(node.value)

        raise ScriptError(node, "Unsupported syntax")
        
    def exec_expr(self, node):
        if isinstance(node, ast.Call):
            return self.exec_call(node)
        raise ScriptError(node, "Only function calls allowed")

    def exec_call(self, node):
        func = node.func.id
        args = [self.eval(arg) for arg in node.args]

        line_no = getattr(node, "lineno", None)  # current line number

        if func == "plant":
            ev = self.farm.plant(*args)
        elif func == "water":
            ev = self.farm.water(*args)
        elif func == "harvest":
            ev = self.farm.harvest(*args)
        elif func == "wait":
            ev = self.farm.wait(*args)
        elif func == "clear":
            ev = self.farm.clear_field(*args)
        else:
            raise ScriptError(node, f"Unknown function: {func}")

        # add line info into the event
        if isinstance(ev, dict):
            ev["line"] = line_no
        return ev
        
    def eval(self, node):
        if isinstance(node, ast.Constant):
            return node.value

        if isinstance(node, ast.Name):
            return self.ctx.get(node.id)

        if isinstance(node, ast.Call) \
            and isinstance(node.func, ast.Name) and node.func.id == "range":
            args = [self.eval(a) for a in node.args]
            try:
                return range(*args)
            except TypeError:
                raise ScriptError(node, "Invalid range() arguments")

        if isinstance(node, ast.Call):
            return self.exec_call(node)

        if isinstance(node, ast.Compare):
            left = self.eval(node.left)
            right = self.eval(node.comparators[0])
            op = node.ops[0]

            if isinstance(op, ast.Gt): return left > right
            if isinstance(op, ast.Lt): return left < right
            if isinstance(op, ast.Eq): return left == right

            raise ScriptError(node, "Unsupported comparison")

        raise ScriptError(node, f"Unsupported expression: {type(node)}")

