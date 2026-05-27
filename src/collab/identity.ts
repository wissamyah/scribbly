import { nanoid } from "nanoid";

const ADJECTIVES = [
  "Pleased",
  "Happy",
  "Curious",
  "Brave",
  "Quiet",
  "Bright",
  "Quick",
  "Gentle",
  "Witty",
  "Lucky",
  "Calm",
  "Bold",
  "Eager",
  "Jolly",
  "Mighty",
  "Sleepy",
  "Sunny",
  "Cosmic",
  "Lively",
  "Nimble",
];

const ANIMALS = [
  "Alligator",
  "Fox",
  "Bear",
  "Whale",
  "Otter",
  "Wolf",
  "Hawk",
  "Panda",
  "Tiger",
  "Lemur",
  "Penguin",
  "Hedgehog",
  "Falcon",
  "Cheetah",
  "Koala",
  "Walrus",
  "Beaver",
  "Buffalo",
  "Jaguar",
  "Lynx",
];

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
];

function pick<T>(arr: readonly T[]): T {
  const i = Math.floor(Math.random() * arr.length);
  return arr[i]!;
}

export function randomName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

export function randomColor(): string {
  return pick(COLORS);
}

export function newUserId(): string {
  return nanoid(10);
}
