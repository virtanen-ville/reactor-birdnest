import { useState, useEffect } from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import { io } from "socket.io-client";
import { Box, CircularProgress, Container, Typography } from "@mui/material";
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

//const socket = io("http://127.0.0.1:3000");
//const socket = io("http:localhost:3000");
//const socket = io("/socket.io");
const socket = io();

function App() {
	const [drones, setDrones] = useState<Drone[]>([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		socket.emit("getData");
		(async () => {
			const res = await fetch("/api/test", {
				method: "GET",
			});
			const data = await res.json();
			console.log("🚀 ~ file: App.tsx:45 ~ data", data);
		})();
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
		<Container
			maxWidth="lg"
			sx={{
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			<Typography variant="h2">Birdnest</Typography>
			{loading ? (
				<CircularProgress
					sx={{
						display: "block",
					}}
				/>
			) : (
				<Paper sx={{ width: "100%", overflow: "hidden" }}>
					<TableContainer sx={{ maxHeight: "80vh" }}>
						<Table
							stickyHeader
							sx={{ minWidth: 650 }}
							aria-label="drone-info-table"
						>
							<TableHead>
								<TableRow>
									<TableCell>Latest observation</TableCell>
									<TableCell align="right">
										Latest in NDZ
									</TableCell>
									<TableCell align="right">
										Closest Distance
									</TableCell>
									<TableCell align="right">Name</TableCell>
									<TableCell align="right">Phone</TableCell>
									<TableCell align="right">Email</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{drones &&
									drones.map((drone, idx) => (
										<TableRow key={idx}>
											<TableCell
												component="th"
												scope="row"
											>
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
												{drone.distance.toFixed(2)}{" "}
												meters
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
				</Paper>
			)}
		</Container>
	);
}

export default App;
