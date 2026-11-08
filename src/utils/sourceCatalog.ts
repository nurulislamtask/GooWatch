export interface CatalogSource { id: string; name: string; url: string; type: 'movies' | 'series'; group: string }

/** Ready-made DhakaFlix / BDIX servers. They are NOT active by default: the user switches them on with one tap. */
export const SOURCE_CATALOG: CatalogSource[] = [
  { id: 'src-lan-english-movies', name: 'English Movies', url: 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-english-1080p', name: 'English Movies · 1080p', url: 'http://172.16.50.14/DHAKA-FLIX-14/English%20Movies%20%281080p%29/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-hindi-movies', name: 'Hindi Movies', url: 'http://172.16.50.14/DHAKA-FLIX-14/Hindi%20Movies/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-hindi-dubbed', name: 'Hindi Dubbed · South', url: 'http://172.16.50.14/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/Hindi%20Dubbed/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-south-movies', name: 'South Indian Movies', url: 'http://172.16.50.14/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/South%20Movies/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-kolkata-bangla', name: 'Bangla Movies · Kolkata', url: 'http://172.16.50.7/DHAKA-FLIX-7/Kolkata%20Bangla%20Movies/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-foreign-movies', name: 'Foreign Language Movies', url: 'http://172.16.50.7/DHAKA-FLIX-7/Foreign%20Language%20Movies/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-3d-movies', name: '3D Movies', url: 'http://172.16.50.7/DHAKA-FLIX-7/3D%20Movies/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-animation-movies', name: 'Animation Movies', url: 'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-animation-1080p', name: 'Animation Movies · 1080p', url: 'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies%20%281080p%29/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-tv-web-series', name: 'TV & Web Series', url: 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/', type: 'series', group: 'Series & anime' },
  { id: 'src-lan-korean-series', name: 'Korean TV & Web Series', url: 'http://172.16.50.14/DHAKA-FLIX-14/KOREAN%20TV%20%26%20WEB%20Series/', type: 'series', group: 'Series & anime' },
  { id: 'src-lan-anime-cartoon', name: 'Anime & Cartoon Series', url: 'http://172.16.50.10/DHAKA-FLIX-10/Anime%20%26%20Cartoon%20TV%20Series/', type: 'series', group: 'Series & anime' },
  { id: 'src-lan-documentary', name: 'Documentaries', url: 'http://172.16.50.10/DHAKA-FLIX-10/Documentary/', type: 'movies', group: 'Movies' },
  { id: 'src-lan-wrestling', name: 'WWE & AEW Wrestling', url: 'http://172.16.50.10/DHAKA-FLIX-10/WWE%20%26%20AEW%20Wrestling/', type: 'series', group: 'Series & anime' },
];
