// Artist-specific outbound links read from artist/label/manager pages on 4 October 2026.
// A verified account link does not grant permission to read its posts through an API.
type Account = { platform: 'facebook' | 'x'; url: string; evidenceUrl: string };
const links = (evidenceUrl: string, facebook?: string, x?: string): Account[] => [
  ...(facebook ? [{ platform: 'facebook' as const, url: facebook, evidenceUrl }] : []),
  ...(x ? [{ platform: 'x' as const, url: x, evidenceUrl }] : []),
];

export const reviewedOfficialAccounts: Record<string, Account[]> = {
  'tilly-birds': links('https://www.tillybirds.com/about', 'https://www.facebook.com/TILLYBIRDS/', 'https://twitter.com/TillyBirds'),
  'three-man-down': links('https://www.kruengkao.com/en/artist/three-man-down', 'https://www.facebook.com/threemandownofficial', 'https://twitter.com/threemandown'),
  cocktail: links('https://universalmusic.fr/artistes/36484961805', 'https://www.facebook.com/cheerscocktail'),
  'slot-machine': links('https://slotmachine.band/bio.php', 'https://www.facebook.com/SlotMachineRock', 'https://twitter.com/slotmachineband'),
  polycat: links('https://smallroom.co.th/artist/1/polycat', 'https://www.facebook.com/polycatband'),
  bus: links('https://www.busofficialmembership.com/th/', undefined, 'https://x.com/bus_sonray'),
  pixxie: links('https://www.universal-music.co.jp/pixxie/', 'https://www.facebook.com/pixxie.official/', 'https://x.com/PIXXIEofficial_'),
  'jeff-satur': links('https://wmg.jp/jeffsatur', undefined, 'https://twitter.com/jeffsatur'),
  'nont-tanont': links('https://www.loveisentertainment.com/nont-tanont', 'https://www.facebook.com/NONTTANONT', 'https://x.com/tanont916'),
  bowkylion: links('https://www.whattheduckmusic.com/a', 'https://www.facebook.com/bowkylion'),
  'the-toys': links('https://www.whattheduckmusic.com/a', 'https://www.facebook.com/thisisthetoys/'),
  musketeers: links('https://www.whattheduckmusic.com/a', 'https://www.facebook.com/musketeersband/'),
  billkin: links('https://www.universal-music.co.jp/billkin/', 'https://www.facebook.com/billkinentertainment', 'https://x.com/Billkin_Ent'),
  'pp-krit': links('https://www.universal-music.co.jp/billkin-and-ppkrit/news/2023-07-31/', undefined, 'https://twitter.com/PPKrit_Ent'),
  'tattoo-colour': links('https://www.smallroom.co.th/artist/2/tattoo-colour', 'https://www.facebook.com/tattoocolour/', 'https://twitter.com/tattoocolourth'),
  scrubb: links('https://www.universal-music.co.jp/scrubb/', 'https://www.facebook.com/scrubbband/', 'https://twitter.com/scrubbband'),
  dept: links('https://www.smallroom.co.th/artist/3/Dept', 'https://www.facebook.com/callmedept', 'https://twitter.com/callmedept'),
};
