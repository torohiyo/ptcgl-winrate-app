export type BattleEventType =
  | "coinFlip"
  | "coinWinner"
  | "orderChoice"
  | "openingHand"
  | "openingHandReveal"
  | "mulligan"
  | "mulliganReveal"
  | "mulliganExtraDraw"
  | "openingActive"
  | "turnStart"
  | "draw"
  | "drewAndPlayed"
  | "playPokemon"
  | "playTrainer"
  | "playStadium"
  | "stadiumDiscarded"
  | "attachEnergy"
  | "evolve"
  | "useAbility"
  | "useAttack"
  | "subDamage"
  | "placeDamageCounters"
  | "moveDamageCounters"
  | "discardCards"
  | "moveToHand"
  | "shuffleDeck"
  | "shuffleIntoDeck"
  | "retreat"
  | "energyDiscarded"
  | "promoteActive"
  | "forceSwitch"
  | "knockOut"
  | "discardOnKO"
  | "singleDiscardOnKO"
  | "takePrize"
  | "prizeRevealed"
  | "prizeHidden"
  | "damageBreakdown"
  | "damageBreakdownItem"
  | "endTurn"
  | "gameEnd"
  | "unparsed";

export interface BattleEvent {
  index: number;
  turn: number; // 0 = setup
  turnPlayer?: string; // whose turn this event belongs to
  type: BattleEventType;
  actor?: string;
  raw: string;
  isSubEvent: boolean;
  payload?: Record<string, unknown>;
}

export interface CardImage {
  name: string;
  small: string;
  large: string;
  setId: string;
}

export interface BattleReplay {
  events: BattleEvent[];
  viewer: string;
  players: string[]; // [player1, player2] in order of appearance
  firstPlayer?: string;
  winner?: string;
  winReason?: "prizes" | "concede";
  totalTurns: number;
  cardNames: string[]; // unique sorted list — for image preload
}
