import assert from "node:assert/strict";
import test from "node:test";
import { getHeroHeadline, heroHeadlines } from "../lib/hero-headlines";

test("hero has five distinct headline options", () => {
  assert.equal(heroHeadlines.length, 5);
  assert.equal(new Set(heroHeadlines).size, 5);
});

test("a refresh randomly selects from the five headlines", () => {
  assert.equal(getHeroHeadline(() => 0), heroHeadlines[0]);
  assert.equal(getHeroHeadline(() => 0.999), heroHeadlines[4]);
  assert.equal(getHeroHeadline(() => 0), getHeroHeadline(() => 0));
});
