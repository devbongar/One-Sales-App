export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  display_name: string | null;
  role_id: number | null;
  role_name: string | null;
  seller_id: string | null;
}

export interface ProjectPhotos {
  location: string[];
  units: string[];
  amenities: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  location: string;
  property_type: string;
  residence_type: string;
  floors: number;
  no_of_units: number;
  no_of_parkings: number;
  cover_photo_url: string;
  photos: ProjectPhotos;
  created_at: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  comingSoon?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export interface InventoryUnit {
  project_id: string | null;
  project_name: string | null;
  tower: string | null;
  floor: string | null;
  unit_no: string | null;
  inventory_code: string | null;
  unit_type: string | null;
  unit_area: number | null;
  total_list_price: string | null;
  promo_discount: string | null;
  status: string | null;
  product_type?: string | null;
  hic?: boolean | null;
}
