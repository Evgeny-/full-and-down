/**
 * Port and ship names per sea area. Codes are the UN/LOCODE location part where it is the familiar
 * one; each port has a default International Code of Signals letter (never B, P, Q or V: those mean
 * things), distinct inside its area. A level's ports always fly distinct flags (`flagsFor`).
 */

export interface PortName {
  name: string;
  code: string;
  flag: string;
}

/** ICS letters a port may fly (B = dangerous cargo, P = Blue Peter, Q = pratique, V = assistance). */
export const PORT_FLAGS = ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z'];

const p = (name: string, code: string, flag: string): PortName => ({ name, code, flag });

/** Index = sea area (0 North Sea … 7 Grand Voyage). */
export const AREA_PORTS: PortName[][] = [
  // North Sea
  [
    p('Rotterdam', 'RTM', 'R'),
    p('Felixstowe', 'FXT', 'F'),
    p('Esbjerg', 'EBJ', 'E'),
    p('Bremerhaven', 'BRV', 'M'),
    p('Aberdeen', 'ABZ', 'D'),
    p('Grimsby', 'GSY', 'G'),
    p('Kiel', 'KIE', 'K'),
    p('Aarhus', 'AAR', 'A'),
    p('Oslo', 'OSL', 'O'),
    p('Immingham', 'IMM', 'I'),
    p('Teesport', 'TEE', 'T'),
    p('Harwich', 'HRW', 'H'),
    p('Stavanger', 'SVG', 'S'),
    p('Bergen', 'BGO', 'N'),
    p('Den Helder', 'DHR', 'L'),
  ],
  // The Coast
  [
    p('Hamburg', 'HAM', 'H'),
    p('Antwerp', 'ANR', 'A'),
    p('Le Havre', 'LEH', 'L'),
    p('Zeebrugge', 'ZEE', 'Z'),
    p('Dunkirk', 'DKK', 'D'),
    p('Calais', 'CQF', 'C'),
    p('Southampton', 'SOU', 'S'),
    p('Cherbourg', 'CER', 'R'),
    p('Brest', 'BES', 'E'),
    p('Dover', 'DVR', 'O'),
    p('Vlissingen', 'VLI', 'I'),
    p('Ostend', 'OST', 'T'),
    p('Wilhelmshaven', 'WVN', 'W'),
    p('Emden', 'EME', 'M'),
  ],
  // Up the Rivers
  [
    p('Rouen', 'URO', 'R'),
    p('Duisburg', 'DUI', 'D'),
    p('Hamburg', 'HAM', 'H'),
    p('Bremen', 'BRE', 'E'),
    p('Nantes', 'NTE', 'N'),
    p('Bordeaux', 'BOD', 'O'),
    p('Seville', 'SVQ', 'S'),
    p('Cologne', 'CGN', 'C'),
    p('Mannheim', 'MHG', 'M'),
    p('Goole', 'GOO', 'G'),
    p('Antwerp', 'ANR', 'A'),
    p('Montoir', 'MTX', 'T'),
    p('Liège', 'LGG', 'L'),
    p('Strasbourg', 'SXB', 'X'),
  ],
  // Bunker Calls
  [
    p('Gibraltar', 'GIB', 'G'),
    p('Las Palmas', 'LPA', 'L'),
    p('Dakar', 'DKR', 'D'),
    p('Tema', 'TEM', 'T'),
    p('Lagos', 'LOS', 'O'),
    p('Abidjan', 'ABJ', 'A'),
    p('Ceuta', 'CEU', 'C'),
    p('Lisbon', 'LIS', 'I'),
    p('Lomé', 'LFW', 'M'),
    p('Nouakchott', 'NKC', 'N'),
    p('Banjul', 'BJL', 'J'),
    p('Freetown', 'FNA', 'F'),
    p('Santa Cruz', 'SCT', 'S'),
  ],
  // Liner Loop
  [
    p('Algeciras', 'ALG', 'A'),
    p('Valencia', 'VLC', 'E'),
    p('Genoa', 'GOA', 'G'),
    p('Piraeus', 'PIR', 'R'),
    p('Marsaxlokk', 'MAR', 'M'),
    p('Barcelona', 'BCN', 'C'),
    p('La Spezia', 'SPE', 'S'),
    p('Gioia Tauro', 'GIT', 'T'),
    p('Livorno', 'LIV', 'L'),
    p('Naples', 'NAP', 'N'),
    p('Marseille', 'MRS', 'D'),
    p('Koper', 'KOP', 'K'),
    p('Trieste', 'TRS', 'I'),
  ],
  // Reefer Run
  [
    p('Valencia', 'VLC', 'E'),
    p('Agadir', 'AGA', 'A'),
    p('Casablanca', 'CAS', 'C'),
    p('Funchal', 'FNC', 'F'),
    p('Tanger Med', 'TNG', 'T'),
    p('Huelva', 'HUV', 'H'),
    p('Cádiz', 'CAD', 'D'),
    p('Santa Cruz', 'SCT', 'S'),
    p('Las Palmas', 'LPA', 'L'),
    p('Vigo', 'VGO', 'G'),
    p('Leixões', 'LEI', 'X'),
    p('Málaga', 'AGP', 'M'),
  ],
  // Winter Passage
  [
    p('Halifax', 'HAL', 'H'),
    p("St John's", 'SJF', 'J'),
    p('Reykjavik', 'REY', 'R'),
    p('Tromsø', 'TOS', 'T'),
    p('Gothenburg', 'GOT', 'G'),
    p('Nuuk', 'GOH', 'N'),
    p('Tórshavn', 'THN', 'O'),
    p('Narvik', 'NVK', 'K'),
    p('Hammerfest', 'HFT', 'M'),
    p('Bodø', 'BOO', 'D'),
    p('Ålesund', 'AES', 'A'),
    p('Sept-Îles', 'SEI', 'S'),
  ],
  // Grand Voyage: a mix (flags are re-dealt per level when they clash)
  [
    p('Rotterdam', 'RTM', 'R'),
    p('Hamburg', 'HAM', 'H'),
    p('Antwerp', 'ANR', 'A'),
    p('Le Havre', 'LEH', 'L'),
    p('Algeciras', 'ALG', 'G'),
    p('Las Palmas', 'LPA', 'S'),
    p('Valencia', 'VLC', 'E'),
    p('Piraeus', 'PIR', 'I'),
    p('Halifax', 'HAL', 'X'),
    p('Reykjavik', 'REY', 'Y'),
    p('Gothenburg', 'GOT', 'O'),
    p('Dakar', 'DKR', 'D'),
    p('Casablanca', 'CAS', 'C'),
    p('Felixstowe', 'FXT', 'F'),
    p('Genoa', 'GOA', 'N'),
    p('Tema', 'TEM', 'T'),
  ],
];

/** Ship names per area (a coaster, a feeder…). */
export const AREA_SHIPS: string[][] = [
  ['Kittiwake', 'Fulmar', 'North Star', 'Skagerrak', 'Dogger'],
  ['Cormorant', 'Wadden', 'Channel Belle', 'Sandpiper', 'Ushant'],
  ['Lorelei', 'Heron', 'Rhine Maid', 'Moselle', 'Kingfisher'],
  ['Trade Wind', 'Harmattan', 'Cape Verde', 'Petrel', 'Canary'],
  ['Levante', 'Mistral', 'Sirocco', 'Meltemi', 'Tramontane'],
  ['Madeira Star', 'Atlas', 'Orange Blossom', 'Cold Harbour', 'Sea Breeze'],
  ['Arctic Tern', 'Polar Light', 'Ice Bird', 'Snow Bunting', 'Aurora'],
  ['Plimsoll', 'Full Away', 'Endeavour', 'Fair Wind', 'Long Haul'],
];

/**
 * `count` ports of an area, starting at `start` in a shuffled order supplied by the caller, with
 * distinct flags (a clashing flag is re-dealt from the free letters).
 */
export function flagsFor(ports: PortName[]): PortName[] {
  const used = new Set<string>();
  return ports.map((pt) => {
    let flag = pt.flag;
    if (used.has(flag) || !PORT_FLAGS.includes(flag)) {
      flag = [...pt.name.toUpperCase(), ...pt.code].find((c) => PORT_FLAGS.includes(c) && !used.has(c)) ?? PORT_FLAGS.find((c) => !used.has(c))!;
    }
    used.add(flag);
    return { ...pt, flag };
  });
}
