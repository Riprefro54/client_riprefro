import {territoryManager} from "../TerritoryManager";
import {onNeighbors} from "../../util/MathUtil";
import {playerNameRenderingManager} from "../../renderer/manager/PlayerNameRenderingManager";
import {attackActionHandler} from "../attack/AttackActionHandler";
import {HSLColor} from "../../util/HSLColor";
import {territoryRenderingManager} from "../../renderer/manager/TerritoryRenderingManager";
import {gameMode} from "../Game";

export class Player {
	readonly id: number;
	readonly name: string;
	readonly baseColor: HSLColor;
	private troops: number = 500;
	readonly borderTiles: Set<number> = new Set();
	private territorySize: number = 0;
	private alive: boolean = true;

	constructor(id: number, name: string, baseColor: HSLColor) {
		this.id = id;
		this.name = name;
		this.baseColor = gameMode.processPlayerColor(id, baseColor);
	}

	/**
	 * Add a tile to the player's territory.
	 * WARNING: Make sure to call this method AFTER updating the territory manager.
	 * @param tile
	 * @internal
	 */
	addTile(tile: number): void {
		this.territorySize++;
		if (territoryManager.isBorder(tile)) {
			this.borderTiles.add(tile);
			territoryRenderingManager.setPlayerBorder(tile);
		} else {
			playerNameRenderingManager.addTile(tile);
			territoryRenderingManager.setTerritory(tile);
		}
		onNeighbors(tile, neighbor => {
			if (territoryManager.isOwner(neighbor, this.id) && !territoryManager.isBorder(neighbor) && this.borderTiles.delete(neighbor)) {
				territoryRenderingManager.setTerritory(neighbor);
				playerNameRenderingManager.addTile(neighbor);
			}
		});

		attackActionHandler.handleTerritoryAdd(tile, this.id);
	}

	/**
	 * Remove a tile from the player's territory.
	 * WARNING: Make sure to call this method AFTER updating the territory manager.
	 * @param tile The tile to remove.
	 * @internal
	 */
	removeTile(tile: number): void {
		this.territorySize--;
		if (!this.borderTiles.delete(tile)) {
			playerNameRenderingManager.removeTile(tile);
		}
		onNeighbors(tile, neighbor => {
			if (territoryManager.isOwner(neighbor, this.id) && !this.borderTiles.has(neighbor)) {
				this.borderTiles.add(neighbor);
				territoryRenderingManager.setTargetBorder(neighbor);
				playerNameRenderingManager.removeTile(neighbor);
			}
		});

		if (this.territorySize === 0) {
			this.alive = false;
		}
	}

	/**
	 * Process one tick worth of income.
	 */
	income(territoryMultiplier: number, troopMultiplier: number) {
		this.addTroops(Math.max(1, Math.floor((this.territorySize * territoryMultiplier) + Math.floor(this.troops * troopMultiplier))));
	}

	/**
	 * @returns The amount of troops the player has.
	 */
	getTroops(): number {
		return this.troops;
	}

	/**
	 * Add troops to the player.
	 * Troops will be capped at 100 times the territory size.
	 * @param amount The amount of troops to add.
	 */
	addTroops(amount: number) {
		this.troops = Math.min(this.territorySize * 100, this.troops + amount);
	}

	/**
	 * Remove troops from the player.
	 * @param amount The amount of troops to remove.
	 */
	removeTroops(amount: number) {
		this.troops = Math.max(0, this.troops - amount);
	}

	/**
	 * @returns The size of the player's territory (in tiles).
	 */
	getTerritorySize(): number {
		return this.territorySize;
	}

	/**
	 * @returns True if the player is alive, false otherwise.
	 */
	isAlive(): boolean {
		return this.alive;
	}
}