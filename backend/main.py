from time import time
from farm import Farm
from executor import Executor
from storage import load_user_farm

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import ast
import asyncio

app = FastAPI()

# ===============================
# API
# ===============================

@app.get("/api/bootstrap")
async def bootstrap(user_id: str | None = None):
    farm = load_user_farm(user_id)
    
    if farm is None:
        farm = Farm()

    return {
        "config": Farm.get_config(),
        "farm": farm.snapshot()
    }

TICK_INTERVAL_FARM = 1 # interval in second
TICK_INTERVAL_REAL = 0.1 # interval in second

async def idle_farm_ticker(
    ws: WebSocket, farm: Farm,
    stop_event: asyncio.Event, max_ticks: int = 999,
):
    """
    Idle 状态下的真实时间 ticker
    每次推进农场时间1秒，并发送 farm_state
    最多执行 max_ticks 次，防止无限运行
    """
    tick_count = 0

    try:
        while not stop_event.is_set() and tick_count < max_ticks:
            await asyncio.sleep(TICK_INTERVAL_REAL)

            farm.tick(TICK_INTERVAL_FARM)

            await ws.send_json({
                "type": "farm_state",
                "farm": farm.snapshot()
            })

            tick_count += 1

    except asyncio.CancelledError:
        pass


# ===============================
# WebSocket
# ===============================

@app.websocket("/ws/run")
async def run_script(ws: WebSocket):
    await ws.accept()

    farm = Farm()
    executor = None
    
    idle_ticker_task = None
    idle_stop_event = asyncio.Event()

    def stop_idle_ticker():
        nonlocal idle_ticker_task, idle_stop_event
        if idle_ticker_task:
            idle_stop_event.set()
            idle_ticker_task.cancel()
            idle_ticker_task = None
            idle_stop_event = asyncio.Event()

    def start_idle_ticker():
        nonlocal idle_ticker_task, idle_stop_event
        idle_stop_event = asyncio.Event()
        idle_ticker_task = asyncio.create_task(
            idle_farm_ticker(ws, farm, idle_stop_event)
        )
        
    async def handle_script_done():
        result = farm.get_script_result()

        new_record = False
        if result["roi"] > farm.best_roi:
            farm.best_roi = result["roi"]
            new_record = True

        await ws.send_json({
            "type": "done",
            "result": {
                "cost": result["cost"],
                "gain": result["gain"],
                "roi": result["roi"],
                "best_roi": farm.best_roi,
                "new_record": new_record
            }
        })
        start_idle_ticker()
        
    try:
        while True:
            msg = await ws.receive_json()

            # ==============================
            # ▶️ START SCRIPT
            # ==============================
            if msg["type"] == "start":
                stop_idle_ticker()

                # 重置时间（但不清金币）
                farm.time = 0
                
                # ---- reset script execution stats ----
                farm.script_cost = 0
                farm.script_gain = 0

                tree = ast.parse(msg["code"])
                is_manual = msg["mode"] == "manual_step"
                executor = Executor(tree, farm, is_manual)

                # 手动 step：立即执行一步
                if is_manual:
                    ev = executor.step()

                    if ev is None:
                        await handle_script_done()
                    else:
                        await ws.send_json({
                            "type": "event",
                            "event": ev
                        })
                        await ws.send_json({
                            "type": "farm_state",
                            "farm": farm.snapshot()
                        })

                # 自动 run
                else:
                    while True:
                        ev = executor.step()

                        if ev is None:
                            await handle_script_done()
                            break

                        await ws.send_json({
                            "type": "event",
                            "event": ev
                        })
                        await ws.send_json({
                            "type": "farm_state",
                            "farm": farm.snapshot()
                        })

                        # 等前端 ack / abort
                        ctrl = await ws.receive_json()

                        if ctrl["type"] == "ack":
                            continue
                        elif ctrl["type"] == "abort":
                            executor = None
                            break

            # ==============================
            # ▶️ STEP (manual mode)
            # ==============================
            elif msg["type"] == "step":
                if executor is None:
                    await ws.send_json({
                        "type": "error",
                        "message": "Script not initialized"
                    })
                    continue

                ev = executor.step()

                if ev is None:
                    await ws.send_json({"type": "done"})
                    start_idle_ticker()
                else:
                    await ws.send_json({
                        "type": "event",
                        "event": ev
                    })
                    await ws.send_json({
                        "type": "farm_state",
                        "farm": farm.snapshot()
                    })

            # ==============================
            # ⏹ ABORT
            # ==============================
            elif msg["type"] == "abort":
                executor = None
                stop_idle_ticker()
                await ws.send_json({"type": "done"})

    except WebSocketDisconnect:
        stop_idle_ticker()
        print("Client disconnected")

    except Exception as e:
        stop_idle_ticker()
        await ws.send_json({
            "type": "error",
            "message": str(e),
            "line": getattr(e, "lineno", None)
        })

# ===============================
# Frontend (最后挂载！！！)
# ===============================
BASE_DIR = Path(__file__).resolve().parent          # project/backend
FRONTEND_DIR = BASE_DIR.parent / "frontend"         # project/frontend

app.mount(
    "/", 
    StaticFiles(directory=FRONTEND_DIR, html=True), 
    name="frontend"
)

@app.get("/")
async def root():
    return {"greeting": "Hello, World!", "message": "Welcome to FastAPI-CyberFarm!"}
