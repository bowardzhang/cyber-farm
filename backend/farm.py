# farm.py
from typing import Dict, Any
import time

# ---------- Crop Config ----------
CROPS = {
    "grass": {
        "plant_cost": 1,
        "harvest_gain": 5,
        "grow_speed": 0.20,
    },
    "wheat": {
        "plant_cost": 5,
        "harvest_gain": 10,
        "grow_speed": 0.12,
    },
    "carrot": {
        "plant_cost": 7,
        "harvest_gain": 15,
        "grow_speed": 0.10,
    },
    "cabbage": {
        "plant_cost": 8,
        "harvest_gain": 20,
        "grow_speed": 0.08,
    },
    "strawberry": {
        "plant_cost": 10,
        "harvest_gain": 28,
        "grow_speed": 0.06,
    },
    "eggplant": {
        "plant_cost": 9,
        "harvest_gain": 22,
        "grow_speed": 0.05,
    },
    "tomato": {
        "plant_cost": 10,
        "harvest_gain": 18,
        "grow_speed": 0.10,
    },
}

GRID_SIZE = 6
BACKGROUND = "assets/farm_bg.webp"

# 0~1 field border in proportion of canvas
FIELD_RATIO = {
    "topLeft":     [0.425, 0.545], #[0.42, 0.54],
    "topRight":    [0.755, 0.625], # [0.78, 0.63]
    "bottomLeft":  [0.165, 0.625], # [0.17, 0.63]
    "bottomRight": [0.565, 0.815], # [0.59, 0.84]
}

GOLD_INITIAL = 500
WATER_COST = 2
EXEC_INTERVAL = 100 # in milliseconds

# ---------- Farm World ----------
class Farm:
    def __init__(self, size: int = GRID_SIZE):
        self.grid_size = size
        self.gold = GOLD_INITIAL  # initial gold
        self.time = 0.0  # farm time in second
        
        # ---- script execution stats ----
        self.script_cost = 0
        self.script_gain = 0
        
        self.best_roi = 0.0

        self.grid = [
            [self._empty_cell() for _ in range(size)]
            for _ in range(size)
        ]
        
    @staticmethod
    def get_config():
        return {
            "grid": GRID_SIZE,
            "background": BACKGROUND,
            "field_ratio": FIELD_RATIO,
            "exec_interval": EXEC_INTERVAL
        }

    # ---------- Cell ----------
    def _empty_cell(self) -> Dict[str, Any]:
        return {
            "type": None,       # crop name
            "maturity": 0.0,    # 0.0 ~ 1.0
            "water": 0.0,       # 0.0 ~ 1.0
            "nutrient": 0.5,    # reserved for future
        }

    def _cell(self, x: int, y: int) -> Dict[str, Any]:
        return self.grid[y][x]

    # ---------- Events ----------
    def _cell_event(self, x: int, y: int) -> Dict[str, Any]:
        return {
            "type": "cell_update",
            "x": x,
            "y": y,
            "cell": self.grid[y][x],
            "gold": self.gold,
        }

    # ---------- API ----------
    def plant(self, crop: str, x: int, y: int) -> Dict[str, Any]:
        if crop not in CROPS:
            raise ValueError(f"Unknown crop: {crop}")

        cell = self._cell(x, y)
        if cell["type"] is not None:
            raise ValueError("Cell already occupied")

        cost = CROPS[crop]["plant_cost"]
        if self.gold < cost:
            raise ValueError("Not enough gold")

        self.gold -= cost
        self.script_cost += cost

        cell.update({
            "type": crop,
            "maturity": 0.0,
            "water": 0.3,
            "nutrient": 0.5,
        })

        return self._cell_event(x, y)

    def water(self, x: int, y: int) -> Dict[str, Any]:
        cell = self._cell(x, y)

        if cell["type"] is None:
            raise ValueError("Nothing to water")

        if self.gold < WATER_COST:
            raise ValueError("Not enough gold")

        self.gold -= WATER_COST
        self.script_cost += WATER_COST

        cell["water"] = min(1.0, cell["water"] + 0.4)

        # water accelerates maturity
        cell["maturity"] = min(
            1.0,
            cell["maturity"] + 0.15 * cell["water"]
        )

        return self._cell_event(x, y)

    def harvest(self, x: int, y: int) -> Dict[str, Any]:
        cell = self._cell(x, y)

        if cell["type"] is None:
            raise ValueError("Nothing to harvest")

        if cell["maturity"] < 1.0:
            raise ValueError("Crop not mature")

        crop = cell["type"]
        gain = CROPS[crop]["harvest_gain"]

        self.gold += gain
        self.script_gain += gain
        self.grid[y][x] = self._empty_cell() # clear the plant in the grid cell

        return self._cell_event(x, y)
    
    # ------ Empty farm field ------
    def clear_field(self)  -> Dict[str, Any]:
        for y in range(self.grid_size):
            for x in range(self.grid_size):
                self.grid[y][x] = self._empty_cell()
                
        return self._cell_event(0, 0)
    
    # ---------- Time ----------
    def tick(self, dt: float) -> None:
        """
        Update farm field as time eclipses.
        dt: seconds
        """
        if dt <= 0:
            return
        self.time += dt
        
        for y in range(self.grid_size):
            for x in range(self.grid_size):
                cell = self.grid[y][x]
                if not cell["type"]:
                    continue

                crop_cfg = CROPS[cell["type"]]
                growth = (crop_cfg["grow_speed"] * cell["water"] * dt)
                cell["maturity"] = min(1.0, cell["maturity"] + growth)
    
    # ---------- Snapshot ----------
    def snapshot(self) -> Dict[str, Any]:
        """
        Full world state (for reconnect / reset)
        """
        return {
            "type": "snapshot",
            "grid": self.grid,
            "gold": self.gold,
            "time": self.time,
        }

    def get_script_result(self):
        cost = self.script_cost
        gain = self.script_gain

        roi = 0
        if gain > cost and cost > 0:
            roi = (gain - cost) / cost

        return {
            "cost": cost,
            "gain": gain,
            "roi": roi
        }

