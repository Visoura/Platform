export interface PreConfiguredCamera {
  id: number;
  name: string;
  location: string;
  zone: string;
  status: 'online' | 'offline';
}

export const PRECONFIGURED_CAMERAS: PreConfiguredCamera[] = [
  { id: 1,  name: 'Entrance A',      location: 'Main Entrance',          zone: 'Zone A', status: 'online'  },
  { id: 2,  name: 'Lobby North',     location: 'Building B – Level 1',   zone: 'Zone B', status: 'online'  },
  { id: 3,  name: 'Parking Lot',     location: 'Outdoor Lot C',          zone: 'Zone C', status: 'online'  },
  { id: 4,  name: 'Server Room',     location: 'Level 2 – East Wing',    zone: 'Zone D', status: 'online'  },
  { id: 5,  name: 'Corridor East',   location: 'Floor 1 – East Hall',    zone: 'Zone A', status: 'online'  },
  { id: 6,  name: 'Rooftop Access',  location: 'Roof Level',             zone: 'Zone E', status: 'offline' },
  { id: 7,  name: 'Loading Dock',    location: 'Warehouse – Dock 3',     zone: 'Zone F', status: 'online'  },
  { id: 8,  name: 'Emergency Exit',  location: 'South Wing – Ground',    zone: 'Zone B', status: 'online'  },
  { id: 9,  name: 'Cafeteria',       location: 'Building A – Level 1',   zone: 'Zone A', status: 'online'  },
  { id: 10, name: 'Stairwell B',     location: 'Building B – All Floors',zone: 'Zone B', status: 'offline' },
  { id: 11, name: 'Reception Desk',  location: 'Lobby – Front Desk',     zone: 'Zone A', status: 'online'  },
  { id: 12, name: 'Fire Exit North', location: 'North Wing – Ground',    zone: 'Zone C', status: 'online'  },
];
