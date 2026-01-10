# 🌱 Cyber Farm

**Cyber Farm** is a browser-based farming simulation game designed to help users learn **Python programming basics through gameplay**.

Instead of clicking buttons to farm, players **write Python scripts** to control planting, watering, fertilizing, and harvesting crops.  
Your code directly affects the farm — if your logic is good, your farm thrives 🌾.

---

## ✨ Features

- 🧠 **Learn Python by coding** — use real Python syntax to control the farm
- 🌱 **Grid-based farming system** with crops, growth, and resources
- 💧 Actions: **plant, water, fertilize, harvest**
- ⏱ **Time-based crop growth** with maturity simulation
- 📊 Script execution statistics (cost, gain, ROI)
- 🏆 Best ROI tracking as an achievement
- 🖥 **Visual feedback**: animations, tooltips, hover highlights
- 🔌 Real-time backend powered by **FastAPI + WebSocket**

---

## 🌾 Crops

Currently supported crops:

| Crop        | Emoji |
|------------|-------|
| Grass      | 🌿 |
| Wheat      | 🌾 |
| Carrot     | 🥕 |
| Cabbage    | 🥬 |
| Strawberry | 🍓 |
| Eggplant   | 🍆 |
| Tomato     | 🍅 |

Each crop has different:
- planting cost
- growth speed
- harvest reward

---

## 🧪 Example Python Script

```python
plant("wheat", 2, 3)
water(2, 3)
water(2, 3)

if is_mature(2, 3):
    harvest(2, 3)
```
Scripts can be executed:

step-by-step (manual mode)

automatically (run-all mode)

🖥 Tech Stack
Frontend

Vanilla JavaScript

HTML5 Canvas (isometric / perspective grid)

CSS (tooltips, animations)

Backend

Python 3

FastAPI

WebSocket for real-time updates

Custom Python AST-based script executor

🚀 Getting Started
1. Clone the repository
git clone https://github.com/your-username/cyber-farm.git
cd cyber-farm

2. Start the backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload


Backend will run at:

http://localhost:8000

3. Start the frontend

Open frontend/index.html directly
or use a simple local server:

cd frontend
python -m http.server 5500


Then open:

http://localhost:5500

🎯 Project Goal

Cyber Farm is designed for:

🧑‍🎓 Beginners learning Python

👨‍🏫 Programming education and teaching demos

🧪 Experimenting with automation logic

🎮 Learning through interactive simulation

The long-term vision is to evolve Cyber Farm into a code-driven sandbox game where logic, optimization, and strategy matter more than clicks.

🛣 Roadmap

 User accounts & persistent farms

 More crops and soil mechanics

 Weather system

 Script sharing & challenges

 Leaderboards (best ROI, efficiency)

 Mobile-friendly UI

📜 License

MIT License
Feel free to fork, modify, and build upon this project.

🙌 Contributions

Contributions, ideas, and feedback are welcome!
If you find a bug or have an idea, please open an issue or submit a pull request.

Happy farming — and happy coding! 🌱🐍
