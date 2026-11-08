"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiInstance } from "@/utils";
import useCredentials from "@/hooks/useCredentials";
import useUserManagement from "@/hooks/useUserManagement";
import useAlert from "@/hooks/useAlert";
import { useRootStore } from "@/components/shared/providers/RootProvider";

type RecordValue = Record<string, any>;

function firstArray(...values: any[]): any[] {
	return values.find(Array.isArray) ?? [];
}

function siteDetails(assignment: RecordValue) {
	const site = assignment.site ?? assignment.Site ?? assignment;
	const cityValue = site.city ?? site.City ?? assignment.city;
	return {
		site,
		code: site.code ?? site.siteCode ?? assignment.siteCode ?? assignment.code ?? `Site ${assignment.id}`,
		city: typeof cityValue === "string" ? cityValue : cityValue?.name ?? assignment.cityName ?? "",
		cityId: Number(site.cityId ?? cityValue?.id ?? assignment.cityId ?? assignment.city?.id) || undefined,
		location: site.location ?? site.address ?? assignment.location ?? assignment.address ?? "—",
		campaign: assignment.campaign ?? assignment.Campaign ?? site.campaign ?? {},
	};
}

function auditorCoversCity(auditor: RecordValue, cityId?: number, cityName?: string) {
	const coveredCities = Array.isArray(auditor.citiesCovered) ? auditor.citiesCovered : [];
	return coveredCities.some((city: any) => {
		const coveredId = Number(typeof city === "object" ? city.id ?? city.cityId : city);
		if (cityId && Number.isFinite(coveredId)) return coveredId === cityId;
		const coveredName = typeof city === "object" ? city.name : undefined;
		return Boolean(cityName && coveredName && coveredName.trim().toLowerCase() === cityName.trim().toLowerCase());
	});
}

export default function UnassignedSiteAssignments() {
	const { accessToken } = useCredentials();
	const { getFieldAuditors } = useUserManagement();
	const { showAndHideAlert } = useAlert();
	const queryClient = useQueryClient();
	const { userDetails } = useRootStore();
	const [selectedAuditors, setSelectedAuditors] = useState<Record<number, string>>({});
	const permitted = ["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"].includes(userDetails?.role ?? "");

	const { data: assignments = [], isLoading, isError, error: assignmentsError } = useQuery({
		queryKey: ["unassigned-site-assignments", userDetails?.id],
		enabled: permitted,
		queryFn: async () => {
			const response = await ApiInstance.get("/site-assignments/unassigned", {
				headers: { "auth-token": accessToken },
			});
			const payload = response.data;
			return firstArray(
				payload,
				payload?.data,
				payload?.unassignedSites,
				payload?.siteAssignments,
				payload?.assignments,
				payload?.data?.data,
				payload?.data?.unassignedSites,
				payload?.data?.siteAssignments,
				payload?.data?.assignments
			);
		},
		retry: false,
	});

	const { data: auditors = [], isLoading: auditorsLoading, isError: auditorsError } = useQuery({
		queryKey: ["active-auditors-for-unassigned-sites", userDetails?.id],
		enabled: permitted,
		queryFn: async () => {
			const firstPage = await getFieldAuditors(1, "");
			const firstPageRows = firstArray(
				firstPage,
				firstPage?.data,
				firstPage?.fieldAuditors,
				firstPage?.auditors,
				firstPage?.data?.data,
				firstPage?.data?.fieldAuditors,
				firstPage?.data?.auditors
			);
			const result = [...firstPageRows];
			const totalPages = firstPage?.totalPages ?? firstPage?.pagination?.totalPages ?? firstPage?.data?.totalPages ?? firstPage?.data?.pagination?.totalPages ?? 1;
			for (let page = 2; page <= totalPages; page++) {
				const response = await getFieldAuditors(page, "");
				result.push(...firstArray(
					response,
					response?.data,
					response?.fieldAuditors,
					response?.auditors,
					response?.data?.data,
					response?.data?.fieldAuditors,
					response?.data?.auditors
				));
			}
			return result.filter((auditor: RecordValue) => auditor.status === true || String(auditor.status).toUpperCase() === "ACTIVE");
		},
		retry: false,
	});

	const assignedCount = useMemo(() => assignments.length, [assignments]);

	async function assignSite(assignment: RecordValue) {
		const auditorId = selectedAuditors[assignment.id];
		if (!auditorId) return;
		try {
			await ApiInstance.patch(
				`/site-assignments/${assignment.id}/assign`,
				{ fieldAuditorId: Number(auditorId) },
				{ headers: { "auth-token": accessToken } }
			);
			showAndHideAlert({ message: "Site assigned to field auditor.", type: "success" });
			setSelectedAuditors((current) => {
				const next = { ...current };
				delete next[assignment.id];
				return next;
			});
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["unassigned-site-assignments", userDetails?.id] }),
				queryClient.invalidateQueries({ queryKey: ["campaignDetails"] }),
				queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
			]);
		} catch (error: any) {
			showAndHideAlert({
				message: error?.response?.data?.error ?? error?.response?.data?.message ?? error?.message ?? "Could not assign site.",
				type: "error",
			});
		}
	}

	if (!permitted) return <p className="text-2xl">You do not have access to assign sites.</p>;

	return (
		<section className="rounded-2xl border border-[#E2E2E2] bg-white">
			<header className="flex flex-wrap items-center justify-between gap-4 p-8">
				<div>
					<h1 className="text-3xl font-extrabold">Unassigned Sites</h1>
					<p className="mt-2 text-xl text-gray-600">Choose an active field auditor who covers each site’s city.</p>
				</div>
				<span className="text-xl">{isLoading ? "Loading..." : `${assignedCount} unassigned`}</span>
			</header>
			<div className="w-full overflow-auto">
				<table className="w-[180%] xl:w-full" cellPadding={15}>
					<thead className="border-y border-[#C7C7C7] bg-[#f5f5f5]">
						<tr>
							{["Site", "City", "Location", "Campaign", "Field Auditor", "Action"].map((heading) => (
								<th key={heading} className="text-left text-2xl font-semibold">{heading}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							<tr><td colSpan={6} className="py-8 text-center text-2xl">Loading unassigned sites...</td></tr>
						) : isError ? (
			<tr><td colSpan={6} className="py-8 text-center text-2xl text-red-600">{(assignmentsError as any)?.response?.data?.error ?? (assignmentsError as any)?.response?.data?.message ?? "Could not load unassigned sites."}</td></tr>
						) : assignments.length ? assignments.map((assignment: RecordValue) => {
							const site = siteDetails(assignment);
							const eligibleAuditors = auditors.filter((auditor: RecordValue) => auditorCoversCity(auditor, site.cityId, site.city));
							const campaignName = site.campaign.campaignID ?? site.campaign.name ?? site.campaign.id ?? assignment.campaignId ?? "—";
							return (
								<tr key={assignment.id} className="border-b border-[#E6E6E6]">
									<td className="text-xl">{site.code}</td>
									<td className="text-xl">{site.city || "—"}</td>
									<td className="text-xl">{site.location}</td>
									<td className="text-xl">{campaignName}</td>
									<td>
						<select className="min-w-64 rounded-xl bg-[#F5F5F5] p-3 text-xl" value={selectedAuditors[assignment.id] ?? ""} onChange={(event) => setSelectedAuditors((current) => ({ ...current, [assignment.id]: event.target.value }))} disabled={auditorsLoading || auditorsError || eligibleAuditors.length === 0}>
							<option value="">{auditorsLoading ? "Loading auditors..." : auditorsError ? "Could not load auditors" : eligibleAuditors.length ? "Select auditor" : "No active auditor covers this city"}</option>
											{eligibleAuditors.map((auditor: RecordValue) => <option key={auditor.id} value={auditor.id}>{auditor.firstname} {auditor.lastname}</option>)}
										</select>
									</td>
									<td><button type="button" disabled={!selectedAuditors[assignment.id]} onClick={() => assignSite(assignment)} className="rounded-xl bg-primary px-5 py-3 text-xl text-white disabled:opacity-40">Assign</button></td>
								</tr>
							);
						}) : (
							<tr><td colSpan={6} className="py-8 text-center text-2xl text-gray-500">There are no unassigned sites.</td></tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}
