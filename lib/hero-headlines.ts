export const heroHeadlines = [
  "More curiosity. Fewer tuitions.",
  "Let learning feel like freedom.",
  "More understanding. Less after-school rush.",
  "Learning that fits life, not the other way around.",
  "Help them understand, not just remember.",
] as const;

export function getHeroHeadline(random = Math.random): string {
  const index = Math.min(Math.floor(random() * heroHeadlines.length), heroHeadlines.length - 1);
  return heroHeadlines[index];
}
