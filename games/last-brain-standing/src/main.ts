import "./style.css";
import { ArenaGame } from "./game";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Game canvas was not found.");

new ArenaGame(canvas);