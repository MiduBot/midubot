import type { StoredImage } from "./services/image.service";

export interface ListState {
  images: StoredImage[];
  page: number;
  filter: string;
}

export const ITEMS_PER_PAGE = 10;
