// Netflix-style categories. Picking one (sidebar on PC, "Categories" button on phone) opens Discover on that genre.
export interface Category {
  id: string; // what the add-ons call it (genre)
  label: string;
  type?: string; // opens a content type instead of a genre (e.g. anime)
}

export const CATEGORIES: Category[] = [
  { id: 'Action', label: 'Action' },
  { id: 'Anime', label: 'Anime', type: 'anime' },
  { id: 'Adventure', label: 'Adventure' },
  { id: 'Animation', label: 'Animation' },
  { id: 'Comedy', label: 'Comedies' },
  { id: 'Crime', label: 'Crime' },
  { id: 'Documentary', label: 'Documentaries' },
  { id: 'Drama', label: 'Dramas' },
  { id: 'Family', label: 'Family' },
  { id: 'Fantasy', label: 'Fantasy' },
  { id: 'History', label: 'History' },
  { id: 'Horror', label: 'Horror' },
  { id: 'Mystery', label: 'Mystery' },
  { id: 'Romance', label: 'Romance' },
  { id: 'Sci-Fi', label: 'Sci-Fi' },
  { id: 'Sport', label: 'Sports' },
  { id: 'Thriller', label: 'Thrillers' },
  { id: 'War', label: 'War' },
  { id: 'Western', label: 'Westerns' },
];

export const CATEGORY_EVENT = 'gw:open-category';
let pending: Category | null = null;

export function openCategory(c: Category) {
  pending = c;
  window.dispatchEvent(new Event(CATEGORY_EVENT));
}
export function takePendingCategory(): Category | null {
  const c = pending;
  pending = null;
  return c;
}
