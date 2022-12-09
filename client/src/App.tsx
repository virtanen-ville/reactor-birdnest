import { useState, useEffect } from "react";
import "./App.css";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import { io } from "socket.io-client";
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

const socket = io("http://127.0.0.1:3000");

function App() {
	const [drones, setDrones] = useState<Drone[]>([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		socket.emit("getData");
	}, []);

	// useEffect(() => {
	// 	let interval = setInterval(async () => {
	// 		const res = await fetch("http://127.0.0.1:3000/drones", {
	// 			method: "GET",
	// 		});
	// 		const data = await res.json();
	// 		setDrones(data);
	// 	}, 1000 * 2); // the second number in seconds
	// 	return () => {
	// 		clearInterval(interval);
	// 	};
	// }, []);

	useEffect(() => {
		if (!socket) return;
		socket.on("connect", () => {
			console.log("Connecting to socket from client");
		});
		socket.on("getData", (data: Drone[]) => {
			if (data.length > 0) {
				setLoading(false);
				setDrones(data);
			}
		});
		return () => {
			socket.off("getData");
		};
	}, [socket]);

	return (
		<div className="App">
			<h1>Birdnest</h1>
			{loading ? (
				<h2>Loading...</h2>
			) : (
				<TableContainer component={Paper}>
					<Table sx={{ minWidth: 650 }} aria-label="drone-info-table">
						<TableHead>
							<TableRow>
								<TableCell>Latest observation</TableCell>
								<TableCell align="right">
									Latest in NDZ
								</TableCell>

								<TableCell align="right">Drone S/N</TableCell>
								<TableCell align="right">
									Closest Distance
								</TableCell>

								<TableCell align="right">Name</TableCell>
								<TableCell align="right">Phone</TableCell>
								<TableCell align="right">Email</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{drones.map((drone, idx) => (
								<TableRow key={idx}>
									<TableCell component="th" scope="row">
										{new Date(
											drone.timestamp
										).toLocaleString()}
									</TableCell>
									<TableCell align="right">
										{new Date(
											drone.NDZtimestamp || ""
										).toLocaleString()}
									</TableCell>
									<TableCell align="right">
										{drone.serialNumber}
									</TableCell>
									<TableCell align="right">
										{drone.distance.toFixed(2)} meters
									</TableCell>
									<TableCell align="right">
										{`${drone.owner.firstName} ${drone.owner.lastName}`}
									</TableCell>
									<TableCell align="right">
										{drone.owner.phoneNumber}
									</TableCell>
									<TableCell align="right">
										{drone.owner.email}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
			)}
		</div>
	);
}

export default App;
