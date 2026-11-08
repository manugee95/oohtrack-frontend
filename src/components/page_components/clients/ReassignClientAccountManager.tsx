"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiInstance } from "@/utils";
import useCredentials from "@/hooks/useCredentials";
import useUserManagement from "@/hooks/useUserManagement";
import useAlert from "@/hooks/useAlert";
import { Client } from "@/types";

export default function ReassignClientAccountManager({ client }: { client: Client }) {
	const [open, setOpen] = useState(false);
	const [managerId, setManagerId] = useState("");
	const [saving, setSaving] = useState(false);
	const { accessToken } = useCredentials();
	const { getAccountManagers } = useUserManagement();
	const { showAndHideAlert } = useAlert();
	const queryClient = useQueryClient();
	const assignment: any = client.clientManagerAssignment;
	const currentAssignment = Array.isArray(assignment) ? assignment[0] : assignment;
	const currentManagerId = currentAssignment?.accountManagerId ?? currentAssignment?.accountManager?.id ?? currentAssignment?.id;
	const canReassign = Boolean(assignment && (!Array.isArray(assignment) || assignment.length > 0));
	const { data: managers = [], isLoading } = useQuery({
		queryKey: ["account-managers-for-reassignment"],
		enabled: open,
		queryFn: async () => {
			const firstPage = await getAccountManagers(1, "");
			const records = [...(firstPage?.data ?? [])];
			for (let page = 2; page <= (firstPage?.totalPages ?? 1); page++) {
				const response = await getAccountManagers(page, "");
				records.push(...(response?.data ?? []));
			}
			return records;
		},
		retry: false,
	});

	if (!canReassign) return null;

	async function saveAssignment() {
		if (!managerId || !client.id) return;
		setSaving(true);
		try {
			await ApiInstance.put(`/clients/${client.id}/account-manager`, {
				accountManagerId: Number(managerId),
			}, { headers: { "auth-token": accessToken } });
			showAndHideAlert({ message: "Client account manager updated successfully.", type: "success" });
			await queryClient.invalidateQueries({ queryKey: ["clients"] });
			setOpen(false);
		} catch (error: any) {
			showAndHideAlert({ message: error?.response?.data?.error ?? error?.message ?? "Could not reassign client.", type: "error" });
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<button type="button" onClick={() => { setManagerId(String(currentManagerId ?? "")); setOpen(true); }} className="w-full text-left text-2xl py-3 border-b border-b-[#E3E3E3]">
				Reassign Account Manager
			</button>
			{open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setOpen(false)}>
				<div className="w-full max-w-xl rounded-2xl bg-white p-8" onClick={(event) => event.stopPropagation()}>
					<h2 className="mb-6 text-3xl font-bold">Reassign Account Manager</h2>
					<label className="mb-2 block text-xl font-semibold" htmlFor="account-manager-reassignment">Account Manager</label>
					<select id="account-manager-reassignment" className="w-full rounded-xl bg-[#F5F5F5] p-4 text-xl" value={managerId} onChange={(event) => setManagerId(event.target.value)} disabled={isLoading}>
						<option value="">{isLoading ? "Loading account managers..." : "Select an account manager"}</option>
						{managers.map((manager: any) => <option key={manager.id} value={manager.id}>{manager.firstname} {manager.lastname} ({manager.email})</option>)}
					</select>
					<div className="mt-8 flex justify-end gap-4">
						<button type="button" className="rounded-xl border px-6 py-3 text-xl" onClick={() => setOpen(false)}>Cancel</button>
						<button type="button" className="rounded-xl bg-primary px-6 py-3 text-xl text-white disabled:opacity-50" disabled={!managerId || saving || String(currentManagerId ?? "") === managerId} onClick={saveAssignment}>{saving ? "Saving..." : "Save"}</button>
					</div>
				</div>
			</div>}
		</>
	);
}
