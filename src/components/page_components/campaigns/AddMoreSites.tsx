"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import PlusIcon from "@/components/shared/icons/PlusIcon";
import useCredentials from "@/hooks/useCredentials";
import { ApiInstance } from "@/utils";

const PAGE_SIZE = 100;

function getCampaignRows(payload: any): any[] {
	return [
		payload,
		payload?.data,
		payload?.campaigns,
		payload?.results,
		payload?.rows,
		payload?.data?.data,
		payload?.data?.campaigns,
		payload?.data?.results,
		payload?.data?.rows,
	].find(Array.isArray) ?? [];
}

function getTotalPages(payload: any): number | undefined {
	const totalPages =
		payload?.totalPages ??
		payload?.total_pages ??
		payload?.pagination?.totalPages ??
		payload?.data?.totalPages ??
		payload?.data?.pagination?.totalPages;
	return Number(totalPages) > 0 ? Number(totalPages) : undefined;
}

export default function AddMoreSites() {
	const { accessToken } = useCredentials();
	const router = useRouter();
	const [campaignId, setCampaignId] = useState("");
	const { data: campaigns = [], isLoading, isError } = useQuery({
		queryKey: ["campaigns-for-add-sites"],
		queryFn: async () => {
			const rows: any[] = [];
			let totalPages: number | undefined;
			for (let page = 1; page <= (totalPages ?? 100); page++) {
				const response = await ApiInstance.get(
					`/campaigns?page=${page}&limit=${PAGE_SIZE}`,
					{ headers: { "auth-token": accessToken } }
				);
				const pageRows = getCampaignRows(response.data);
				totalPages ??= getTotalPages(response.data);
				rows.push(...pageRows);
				if (!pageRows.length || (totalPages === undefined && pageRows.length < PAGE_SIZE)) break;
			}
			return rows;
		},
		retry: false,
	});

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
			<select
				aria-label="Choose a campaign to add sites to"
				className="h-[48px] min-w-[240px] rounded-full border border-[#BFBFBF] bg-white px-5 text-xl"
				value={campaignId}
				disabled={isLoading || isError || campaigns.length === 0}
				onChange={(event) => setCampaignId(event.target.value)}>
				<option value="">
					{isLoading
						? "Loading campaigns..."
						: isError
						? "Could not load campaigns"
						: campaigns.length
						? "Select campaign"
						: "No campaigns available"}
				</option>
				{campaigns.map((campaign: any, index: number) => (
					<option key={campaign.id ?? campaign.campaignID ?? index} value={campaign.id}>
						{campaign.campaignID ?? campaign.name ?? `Campaign ${campaign.id}`}
					</option>
				))}
			</select>
			<button
				type="button"
				disabled={!campaignId}
				onClick={() => router.push(`/campaigns/more-sites/${campaignId}`)}
				className="flex h-[50px] items-center justify-center gap-3 whitespace-nowrap rounded-full bg-primary px-6 text-xl text-white disabled:cursor-not-allowed disabled:opacity-50">
				<PlusIcon fill="white" />
				Add more sites
			</button>
		</div>
	);
}
