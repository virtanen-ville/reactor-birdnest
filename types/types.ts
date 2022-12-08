export interface Drone {
	serialNumber: string;
	timestamp: string;
	NDZtimestamp: string | null;
	model: string;
	manufacturer: string;
	positionX: number;
	positionY: number;
	altitude: number;
	distance: number;
	owner: Owner;
}
export interface Owner {
	pilotId: string;
	firstName: string;
	lastName: string;
	phoneNumber: string;
	createdDt: string;
	email: string;
}
export interface ServerToClientEvents {
	getData: (data: Drone[]) => void;
}

export interface ClientToServerEvents {
	getData: (data?: Drone[]) => void;
}

export interface InterServerEvents {
	ping: () => void;
}
export interface SocketData {
	name: string;
	age: number;
	username?: string;
	_id?: string;
}
export interface Coordinates {
	x: number;
	y: number;
}
