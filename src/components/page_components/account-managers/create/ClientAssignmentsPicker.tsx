"use client";

import { useEffect, useMemo, useRef } from "react";

type ClientRecord = {
	id: number | string;
	name?: string;
	email?: string;
	advertiser?: { name?: string };
	clientManagerAssignment?: any;
};

function assignedManagerId(value: any): number | undefined {
	const assignment = Array.isArray(value) ? value[0] : value;
	if (typeof assignment === "number" || typeof assignment === "string") {
		const id = Number(assignment);
		return Number.isFinite(id) ? id : undefined;
	}
	const managerId = assignment?.accountManagerId ?? assignment?.accountManager?.id ?? assignment?.id;
	return managerId == null ? undefined : Number(managerId);
}

export default function ClientAssignmentsPicker({
	clients,
	managerId,
	clientIds,
	setClientIds,
	isEditing,
	isLoading,
	loadError,
	selectionReady,
	selectionIds,
}: {
	clients: ClientRecord[];
	managerId?: number;
	clientIds: number[];
	setClientIds: (ids: number[]) => void;
	isEditing: boolean;
	isLoading: boolean;
	loadError: boolean;
	selectionReady: boolean;
	selectionIds: number[];
}) {
	const initializedForManager = useRef<number | undefined>(undefined);
	const managerClients = useMemo(() => {
		return clients.filter((client) => {
			const assignment = client.clientManagerAssignment;
			const assignedId = assignedManagerId(assignment);
			const unassigned = !assignment || assignment === false ||
				(Array.isArray(assignment) && assignment.length === 0) ||
				(typeof assignment === "object" && !Array.isArray(assignment) && !assignedId);
			return unassigned || clientIds.includes(Number(client.id)) ||
				(isEditing && managerId != null && assignedId === managerId);
		});
	}, [clients, clientIds, isEditing, managerId]);

	useEffect(() => {
		if (!isEditing || !selectionReady || managerId == null || initializedForManager.current === managerId) return;
		initializedForManager.current = managerId;
		setClientIds(selectionIds);
	}, [isEditing, managerId, selectionIds, selectionReady, setClientIds]);

	return (
		<section className="flex flex-col gap-y-4">
			<h2 className="text-2xl font-semibold">Assign clients</h2>
			<p className="text-xl text-gray-600">
				{isEditing
					? "Select the clients assigned to this account manager. Existing assignments are preselected."
					: "Select one or more unassigned clients for this account manager."}
			</p>
			{loadError ? (
				<p className="text-xl text-red-600">Could not load clients. Please refresh and try again.</p>
			) : isLoading ? (
				<p className="text-xl">Loading clients...</p>
			) : managerClients.length ? (
				<div className="max-h-72 overflow-y-auto rounded-xl border border-[#E2E2E2]">
					{managerClients.map((client) => {
						const clientId = Number(client.id);
						const label = client.advertiser?.name ?? client.name ?? client.email ?? `Client ${clientId}`;
						const selected = clientIds.includes(clientId);
						return (
							<label key={clientId} className="flex cursor-pointer items-center gap-4 border-b p-4 text-xl last:border-0">
								<input
									type="checkbox"
									checked={selected}
									onChange={(event) => {
										setClientIds(event.target.checked
											? [...clientIds, clientId]
											: clientIds.filter((id) => id !== clientId));
									}}
								/>
								<span>{label}</span>
							</label>
						);
					})}
				</div>
			) : (
				<p className="text-xl text-gray-600">There are no available clients to assign.</p>
			)}
		</section>
	);
}
