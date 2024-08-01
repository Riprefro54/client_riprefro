import {playerManager} from "../player/PlayerManager";
import {gameTicker} from "../GameTicker";
import {territoryManager} from "../TerritoryManager";
import {Player} from "../player/Player";
import {AttackExecutor} from "./AttackExecutor";
import {gameMap, gameMode} from "../Game";

class AttackActionHandler {
	private attacks: AttackExecutor[] = [];
	private playerIndex: (AttackExecutor | null)[][] = [];
	private unclaimedIndex: (AttackExecutor | null)[] = [];
	private playerAttackList: AttackExecutor[][] = [];
	private targetAttackList: AttackExecutor[][] = [];
	private unclaimedAttackList: AttackExecutor[] = [];
	amountCache: Uint8Array;

	init(maxPlayers: number): void {
		this.attacks = [];
		this.playerIndex = new Array(maxPlayers).fill(null).map(() => new Array<AttackExecutor | null>(maxPlayers).fill(null));
		this.playerAttackList = new Array(maxPlayers).fill(null).map(() => []);
		this.targetAttackList = new Array(maxPlayers).fill(null).map(() => []);
		this.unclaimedIndex = [];
		this.amountCache = new Uint8Array(gameMap.width * gameMap.height);
	}

	//TODO: Move this out of here
	preprocessAttack(player: number, target: number, percentage: number): void {
		if (!gameMode.canAttack(player, target)) {
			return;
		}

		const troopCount = Math.floor(playerManager.getPlayer(player).getTroops() * percentage);
		playerManager.getPlayer(player).removeTroops(troopCount);

		if (target === territoryManager.OWNER_NONE) {
			this.attackUnclaimed(playerManager.getPlayer(player), troopCount);
			return;
		}
		this.attackPlayer(playerManager.getPlayer(player), playerManager.getPlayer(target), troopCount);
	}

	//TODO: Remove this once we have proper attack buttons
	hasBorderWith(player: Player, target: number): boolean {
		for (const tile of player.borderTiles) {
			const x = tile % gameMap.width;
			const y = Math.floor(tile / gameMap.width);
			if (x > 0 && territoryManager.isOwner(tile - 1, target)) {
				return true;
			}
			if (x < gameMap.width - 1 && territoryManager.isOwner(tile + 1, target)) {
				return true;
			}
			if (y > 0 && territoryManager.isOwner(tile - gameMap.width, target)) {
				return true;
			}
			if (y < gameMap.height - 1 && territoryManager.isOwner(tile + gameMap.width, target)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Schedule an attack on an unclaimed territory.
	 * @param player The player that is attacking.
	 * @param troops The amount of troops that are attacking.
	 * @param borderTiles The tiles from which the attack is executed, or null to use the player's border tiles.
	 */
	attackUnclaimed(player: Player, troops: number, borderTiles: Set<number> | null = null): void {
		const parent = this.unclaimedIndex[player.id];
		if (parent) {
			parent.modifyTroops(troops);
			return;
		}

		this.addUnclaimed(player, troops, borderTiles);
	}

	/**
	 * Schedule an attack on a player.
	 * @param player The player that is attacking.
	 * @param target The player that is being attacked.
	 * @param troops The amount of troops that are attacking.
	 * @param borderTiles The tiles from which the attack is executed, or null to use the player's border tiles.
	 */
	attackPlayer(player: Player, target: Player, troops: number, borderTiles: Set<number> | null = null): void {
		const parent = this.getAttack(player, target);
		if (parent) {
			parent.modifyTroops(troops);
			return;
		}

		const opposite = this.getAttack(target, player);
		if (opposite) {
			if (opposite.oppose(troops)) return;
			this.removeAttack(opposite);
			troops -= opposite.getTroops();
		}

		this.addAttack(player, target, troops, borderTiles);
	}

	/**
	 * Get the attack executor for the given players.
	 * @param player The player that is attacking.
	 * @param target The player that is being attacked.
	 * @returns The attack executor for the given players.
	 * @private
	 */
	private getAttack(player: Player, target: Player): AttackExecutor | null {
		return this.playerIndex[player.id][target.id];
	}

	/**
	 * Add an unclaimed attack to the list of ongoing attacks.
	 * @param player The player that is attacking.
	 * @param troops The amount of troops that are attacking.
	 * @param borderTiles The tiles from which the attack is executed, or null to use the player's border tiles.
	 * @private
	 */
	private addUnclaimed(player: Player, troops: number, borderTiles: Set<number> | null = null): void {
		const attack = new AttackExecutor(player, null, troops, borderTiles);
		this.attacks.push(attack);
		this.unclaimedIndex[player.id] = attack;
		this.playerAttackList[player.id].push(attack);
		this.unclaimedAttackList.push(attack);
	}

	/**
	 * Add an attack to the list of ongoing attacks.
	 * @param player The player that is attacking.
	 * @param target The player that is being attacked.
	 * @param troops The amount of troops that are attacking.
	 * @param borderTiles The tiles from which the attack is executed, or null to use the player's border tiles.
	 * @private
	 */
	private addAttack(player: Player, target: Player, troops: number, borderTiles: Set<number> | null = null): void {
		const attack = new AttackExecutor(player, target, troops, borderTiles);
		this.attacks.push(attack);
		this.playerIndex[player.id][target.id] = attack;
		this.playerAttackList[player.id].push(attack);
		this.targetAttackList[target.id].push(attack);
	}

	/**
	 * Remove an attack from the list of ongoing attacks.
	 * @param attack The attack to remove.
	 * @private
	 */
	private removeAttack(attack: AttackExecutor): void {
		this.attacks.splice(this.attacks.indexOf(attack), 1);
		this.playerAttackList[attack.player.id].splice(this.playerAttackList[attack.player.id].indexOf(attack), 1);
		if (attack.target) {
			this.playerIndex[attack.player.id][attack.target.id] = null;
			this.targetAttackList[attack.target.id].splice(this.targetAttackList[attack.target.id].indexOf(attack), 1);
		} else {
			this.unclaimedIndex[attack.player.id] = null;
			this.unclaimedAttackList.splice(this.unclaimedAttackList.indexOf(attack), 1);
		}
	}

	tick(): void {
		for (const attack of this.attacks) {
			if (attack.tick()) {
				continue;
			}
			playerManager.getPlayer(attack.player.id).addTroops(attack.getTroops());
			this.removeAttack(attack);
		}
	}

	/**
	 * Handle a tile being added to a player.
	 * @param tile The tile that was added.
	 * @param player The player that the tile was added to.
	 */
	handleTerritoryAdd(tile: number, player: number): void {
		for (let i = 0; i < this.playerAttackList[player].length; i++) {
			this.playerAttackList[player][i].handlePlayerTileAdd(tile);
		}

		for (let i = 0; i < this.targetAttackList[player].length; i++) {
			this.targetAttackList[player][i].handleTargetTileAdd(tile);
		}
	}

	clear(): void {
		this.attacks = [];
		this.playerIndex = [];
	}
}

export const attackActionHandler = new AttackActionHandler();

gameTicker.registry.register(attackActionHandler.tick.bind(attackActionHandler));