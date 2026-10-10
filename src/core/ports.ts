/**
 * Port and ship names per sea area. Codes are the UN/LOCODE location part where it is the familiar
 * one; each port has a default International Code of Signals letter (never B, P, Q or V: those mean
 * things), distinct inside its area. A level's ports always fly distinct flags (`flagsFor`).
 */

export interface PortName {
  name: string;
  /** the location part of the UN/LOCODE (RTM of NLRTM) */
  code: string;
  /** default International Code of Signals letter */
  flag: string;
  /** ISO 3166 country (the first two letters of the UN/LOCODE): the national flag */
  country: string;
}

/** ICS letters a port may fly (B = dangerous cargo, P = Blue Peter, Q = pratique, V = assistance). */
export const PORT_FLAGS = ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z'];

const p = (name: string, code: string, flag: string, country: string): PortName => ({ name, code, flag, country });

/**
 * Index = sea area (0 North Sea … 7 Round the World). Each list runs in ROUTE ORDER, so a voyage takes
 * a run of neighbouring ports (see core/naming.ts): Kiel to Stockholm, Istanbul up the Danube to
 * Odessa, Las Palmas through Suez to Fujairah, Colombo to Busan, Callao through the Canal to Veracruz,
 * Yokohama round the Aleutians to Portland. The North Sea keeps its own short-sea mix.
 */
export const AREA_PORTS: PortName[][] = [
  // North Sea: home waters
  [
    p('Rotterdam', 'RTM', 'R', 'NL'),
    p('Felixstowe', 'FXT', 'F', 'GB'),
    p('Esbjerg', 'EBJ', 'E', 'DK'),
    p('Bremerhaven', 'BRV', 'M', 'DE'),
    p('Aberdeen', 'ABD', 'D', 'GB'),
    p('Grimsby', 'GSY', 'G', 'GB'),
    p('Kiel', 'KEL', 'K', 'DE'),
    p('Aarhus', 'AAR', 'A', 'DK'),
    p('Oslo', 'OSL', 'O', 'NO'),
    p('Immingham', 'IMM', 'I', 'GB'),
    p('Teesport', 'TEE', 'T', 'GB'),
    p('Harwich', 'HRW', 'H', 'GB'),
    p('Stavanger', 'SVG', 'S', 'NO'),
    p('Bergen', 'BGO', 'N', 'NO'),
    p('Den Helder', 'DHR', 'L', 'NL'),
  ],
  // The Baltic: Kiel to Stockholm, the long way round
  [
    p('Kiel', 'KEL', 'K', 'DE'),
    p('Lübeck', 'LBC', 'L', 'DE'),
    p('Copenhagen', 'CPH', 'C', 'DK'),
    p('Gothenburg', 'GOT', 'G', 'SE'),
    p('Szczecin', 'SZZ', 'S', 'PL'),
    p('Gdynia', 'GDY', 'Y', 'PL'),
    p('Gdańsk', 'GDN', 'D', 'PL'),
    p('Klaipėda', 'KLJ', 'J', 'LT'),
    p('Riga', 'RIX', 'R', 'LV'),
    p('Tallinn', 'TLL', 'T', 'EE'),
    p('Helsinki', 'HEL', 'H', 'FI'),
    p('Kotka', 'KTK', 'O', 'FI'),
    p('Turku', 'TKU', 'U', 'FI'),
    p('Stockholm', 'STO', 'M', 'SE'),
  ],
  // Black Sea: the Bosphorus, the Danube, Odessa and round to Georgia
  [
    p('Istanbul', 'IST', 'I', 'TR'),
    p('Burgas', 'BOJ', 'U', 'BG'),
    p('Varna', 'VAR', 'A', 'BG'),
    p('Constanța', 'CND', 'C', 'RO'),
    p('Galați', 'GAL', 'G', 'RO'),
    p('Reni', 'RNI', 'R', 'UA'),
    p('Izmail', 'IZL', 'Z', 'UA'),
    p('Odessa', 'ODS', 'O', 'UA'),
    p('Chornomorsk', 'ILK', 'K', 'UA'),
    p('Pivdennyi', 'YUZ', 'Y', 'UA'),
    p('Mykolaiv', 'NIK', 'N', 'UA'),
    p('Samsun', 'SSX', 'S', 'TR'),
    p('Batumi', 'BUS', 'T', 'GE'),
    p('Poti', 'PTI', 'E', 'GE'),
  ],
  // Bunker Calls: the classic bunker stops, Las Palmas through Suez to Fujairah
  [
    p('Las Palmas', 'LPA', 'L', 'ES'),
    p('Gibraltar', 'GIB', 'G', 'GI'),
    p('Algeciras', 'ALG', 'A', 'ES'),
    p('Marsaxlokk', 'MAR', 'M', 'MT'),
    p('Piraeus', 'PIR', 'R', 'GR'),
    p('Port Said', 'PSD', 'D', 'EG'),
    p('Suez', 'SUZ', 'S', 'EG'),
    p('Jeddah', 'JED', 'J', 'SA'),
    p('Djibouti', 'JIB', 'I', 'DJ'),
    p('Salalah', 'SLL', 'H', 'OM'),
    p('Sohar', 'SOH', 'O', 'OM'),
    p('Fujairah', 'FJR', 'F', 'AE'),
    p('Khor Fakkan', 'KLF', 'K', 'AE'),
    p('Jebel Ali', 'JEA', 'E', 'AE'),
  ],
  // Straits & China Seas: Colombo through Malacca and up the coast to Busan
  [
    p('Colombo', 'CMB', 'C', 'LK'),
    p('Port Klang', 'PKG', 'K', 'MY'),
    p('Tanjung Pelepas', 'TPP', 'T', 'MY'),
    p('Singapore', 'SIN', 'S', 'SG'),
    p('Laem Chabang', 'LCH', 'L', 'TH'),
    p('Ho Chi Minh City', 'SGN', 'G', 'VN'),
    p('Hai Phong', 'HPH', 'H', 'VN'),
    p('Hong Kong', 'HKG', 'O', 'HK'),
    p('Yantian', 'YTN', 'Y', 'CN'),
    p('Xiamen', 'XMN', 'X', 'CN'),
    p('Kaohsiung', 'KHH', 'A', 'TW'),
    p('Manila', 'MNL', 'M', 'PH'),
    p('Ningbo', 'NGB', 'N', 'CN'),
    p('Shanghai', 'SHA', 'I', 'CN'),
    p('Busan', 'PUS', 'U', 'KR'),
  ],
  // Banana Coast: Peru and Ecuador, through the Canal, round the Caribbean
  [
    p('Callao', 'CLL', 'C', 'PE'),
    p('Paita', 'PAI', 'D', 'PE'),
    p('Puerto Bolívar', 'PBO', 'O', 'EC'),
    p('Guayaquil', 'GYE', 'G', 'EC'),
    p('Balboa', 'BLB', 'E', 'PA'),
    p('Colón', 'ONX', 'N', 'PA'),
    p('Puerto Limón', 'LIO', 'L', 'CR'),
    p('Turbo', 'TRB', 'T', 'CO'),
    p('Cartagena', 'CTG', 'A', 'CO'),
    p('Santa Marta', 'SMR', 'S', 'CO'),
    p('Kingston', 'KIN', 'K', 'JM'),
    p('Santo Tomás', 'STC', 'M', 'GT'),
    p('Veracruz', 'VER', 'R', 'MX'),
  ],
  // North Pacific: Japan, round the Aleutians, down to the Columbia
  [
    p('Yokohama', 'YOK', 'Y', 'JP'),
    p('Hakodate', 'HKD', 'H', 'JP'),
    p('Tomakomai', 'TMK', 'T', 'JP'),
    p('Kushiro', 'KUH', 'K', 'JP'),
    p('Dutch Harbor', 'DUT', 'D', 'US'),
    p('Kodiak', 'ADQ', 'A', 'US'),
    p('Anchorage', 'ANC', 'C', 'US'),
    p('Prince Rupert', 'PRR', 'R', 'CA'),
    p('Vancouver', 'VAN', 'N', 'CA'),
    p('Seattle', 'SEA', 'S', 'US'),
    p('Tacoma', 'TIW', 'W', 'US'),
    p('Portland', 'PDX', 'O', 'US'),
  ],
  // Round the World: the big hubs, west about
  [
    p('Rotterdam', 'RTM', 'R', 'NL'),
    p('Algeciras', 'ALG', 'A', 'ES'),
    p('Port Said', 'PSD', 'D', 'EG'),
    p('Fujairah', 'FJR', 'F', 'AE'),
    p('Colombo', 'CMB', 'C', 'LK'),
    p('Singapore', 'SIN', 'S', 'SG'),
    p('Hong Kong', 'HKG', 'H', 'HK'),
    p('Shanghai', 'SHA', 'I', 'CN'),
    p('Busan', 'PUS', 'U', 'KR'),
    p('Long Beach', 'LGB', 'L', 'US'),
    p('Balboa', 'BLB', 'M', 'PA'),
    p('Houston', 'HOU', 'O', 'US'),
    p('New York', 'NYC', 'N', 'US'),
    p('Santos', 'SSZ', 'T', 'BR'),
    p('Cape Town', 'CPT', 'E', 'ZA'),
    p('Durban', 'DUR', 'G', 'ZA'),
    p('Sydney', 'SYD', 'Y', 'AU'),
  ],
];

/** Ship names per area (a coaster, a feeder…). */
export const AREA_SHIPS: string[][] = [
  ['Kittiwake', 'Fulmar', 'North Star', 'Skagerrak', 'Dogger'],
  ['Amber Coast', 'Hanseatic', 'Curonian', 'Gotland', 'Annamaria'],
  ['Arkadia', 'Langeron', 'Privoz', 'Deribasovskaya', 'Gala'],
  ['Trade Wind', 'Harmattan', 'Khamsin', 'Shamal', 'Sinbad'],
  ['Lion City', 'Malacca', 'Typhoon', 'Junk Bay', 'Straits Star'],
  ['Cavendish', 'Gros Michel', 'Gatun', 'Aralia', 'Darien'],
  ['Aleutian', 'Kuroshio', 'Salish Sea', 'Orca', 'Hokkaido Maru'],
  ['Plimsoll', 'Full Away', 'Endeavour', 'Milky Way', 'Long Haul'],
];

/**
 * The bulk carriers sail under the names of Unimor Shipping's Supramaxes (Ocean Agencies' sister
 * fleet, Odessa), one name per bulker voyage, in campaign order. The multipurpose ships Annamaria,
 * Gala, Aralia and Milky Way are in the area lists above.
 */
export const BULKER_NAMES = ['Alberta', 'Alicia', 'Amadora', 'Aragona', 'Arcola', 'Arinaga', 'Armeria', 'Arnica', 'Arosa', 'Astoria'];

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
