"use client";
import React, { useState } from "react";
import CampaignTableActions from "./CampaignTableActions";
import Kebab from "@/components/shared/icons/Kebab";
import Pagination from "@/components/shared/Pagination";
import Dropdown from "@/components/shared/Dropdown";
import ViewCampaign from "./ViewCampaign";
import DeleteCampaign from "./DeleteCampaign";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import useCredentials from "@/hooks/useCredentials";
import { ApiInstance } from "@/utils";
import CampaignPlaceholder from "@/components/shared/CampaignPlaceholder";
import { Campaign } from "@/types";
import AppButton from "@/components/shared/AppButton";
import Link from "next/link";
import EmptyTableRow from "@/components/shared/EmptyTableRow";
import { useRootStore } from "@/components/shared/providers/RootProvider";

const CAMPAIGNS_PER_PAGE = 10;

function normalizeCampaignPage(payload: any) {
	const rows = [
		payload,
		payload?.data,
		payload?.campaigns,
		payload?.results,
		payload?.rows,
		payload?.data?.data,
		payload?.data?.campaigns,
		payload?.data?.results,
		payload?.data?.rows,
		payload?.data?.data?.campaigns,
	].find(Array.isArray) ?? [];
	const pageSize = payload?.limit ?? payload?.pageSize ?? payload?.perPage ?? payload?.itemsPerPage ?? payload?.pagination?.limit ?? payload?.pagination?.perPage ?? payload?.data?.limit ?? payload?.data?.pageSize;
	const total = payload?.total ?? payload?.totalCount ?? payload?.totalItems ?? payload?.pagination?.total ?? payload?.meta?.total ?? payload?.data?.total;
	const reportedTotalPages = payload?.totalPages ?? payload?.total_pages ?? payload?.pageCount ?? payload?.lastPage ?? payload?.pages ?? payload?.pagination?.totalPages ?? payload?.pagination?.total_pages ?? payload?.pagination?.lastPage ?? payload?.meta?.totalPages ?? payload?.data?.totalPages ?? payload?.data?.pagination?.totalPages;
	const totalPages = reportedTotalPages ?? (total && pageSize ? Math.ceil(total / pageSize) : undefined);
	return { ...payload, data: rows, totalPages, pageSize, hasPaginationMetadata: totalPages != null };
}

export default function CampaignsTable({
	forCompliance = false,
}: {
	forCompliance?: boolean;
}) {
	const { accessToken } = useCredentials();
	const { userDetails } = useRootStore();
	const canDeleteCampaign = userDetails?.role !== "ACCOUNT_MANAGER";
	const [currentPage, setCurrentPage] = useState(1);
	const [search, setSearch] = useState("");

	const { data, isLoading, isFetching } = useQuery({
		queryKey: ["campaigns", currentPage, search, CAMPAIGNS_PER_PAGE],
		queryFn: async () => {
			const getPage = async (page: number) => {
				const response = await ApiInstance.get(
					`/campaigns?page=${page}&limit=${CAMPAIGNS_PER_PAGE}&search=${encodeURIComponent(search)}`,
					{ headers: { "auth-token": accessToken } }
				);
				return normalizeCampaignPage(response.data);
			};
			const currentResult = await getPage(currentPage);
			if (currentResult.hasPaginationMetadata || currentResult.data.length === 0) return currentResult;

			let inferredPageSize = currentResult.pageSize as number | undefined;
			let inferredTotalPages = 0;
			const seenPageSignatures = new Set<string>();
			for (let page = 1; page <= 100; page++) {
				const result = page === currentPage ? currentResult : await getPage(page);
				if (!result.data.length) break;
				const pageSize = inferredPageSize ?? result.data.length;
				inferredPageSize = pageSize;
				const signature = result.data.map((campaign: Campaign) => campaign.id ?? campaign.campaignID ?? JSON.stringify(campaign)).join("|");
				if (seenPageSignatures.has(signature)) break;
				seenPageSignatures.add(signature);
				inferredTotalPages = page;
				if (result.hasPaginationMetadata) {
					inferredTotalPages = result.totalPages;
					inferredPageSize = result.pageSize ?? inferredPageSize;
					break;
				}
				if (result.data.length < pageSize) break;
			}
			return {
				...currentResult,
				pageSize: inferredPageSize,
				totalPages: Math.max(inferredTotalPages, currentPage),
			};
		},
		gcTime: 0,
		placeholderData: keepPreviousData,
		retry: false,
	});

	return (
		<div className="min-h-[70vh] flex flex-col">
			<CampaignTableActions setSearch={(value) => { setSearch(value); setCurrentPage(1); }} showAddMoreSites={!forCompliance} />
			<div className="w-full overflow-x-auto">
				<table className="w-[100%] md:w-[100%] xl:w-full" cellPadding={15}>
					<thead className="border-b border-t border-[#C7C7C7] border-t-[#C7C7C7] bg-[#f5f5f5]">
						<tr>
							<th>
								<span className="text-2xl font-semibold">SN</span>
							</th>
							<th className="text-center hidden xl:table-cell">
								<span className="text-2xl font-semibold">Campaign ID</span>
							</th>
							<th>
								<span className="text-2xl font-semibold">Client</span>
							</th>
							<th className="hidden xl:table-cell">
								<span className="text-2xl font-semibold">Date</span>
							</th>
							<th className="hidden xl:table-cell">
								<span className="text-2xl font-semibold">Total Sites</span>
							</th>
							<th className="text-center">
								<span className="text-2xl font-semibold">Actions</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{isLoading || isFetching
							? Array(5)
									.fill("")
									.map((d, index) => <CampaignPlaceholder key={index} />)
							: data?.data?.length
							? data.data.map((d: Campaign, i: number) => (
									<tr
										key={d.id ?? `${d.campaignID}-${i}`}
										className="border-b-[#E6E6E6] border-b 
                        ">
										<td className="text-center">
										<span className="text-2xl font-medium">{(currentPage - 1) * (data.pageSize ?? CAMPAIGNS_PER_PAGE) + i + 1}</span>
										</td>
										<td className="text-center hidden xl:table-cell">
											<span className="text-2xl font-medium">
												{d.campaignID}
											</span>
										</td>
										<td className="text-center">
											<span className="text-2xl font-medium">
												{d.client?.advertiser?.name ?? d.client?.name ?? (d as any).clientName ?? "-"}
											</span>
										</td>
										<td className="text-center hidden xl:table-cell">
											<span className="text-2xl font-medium text-center">
												{d.uploadedAt ? new Date(d.uploadedAt).toDateString() : "-"}
											</span>
										</td>
										<td className="text-center hidden xl:table-cell">
											<span className="text-2xl font-medium">
												{d.siteList?.length ?? (d as any).totalSites ?? 0}
											</span>
										</td>
										<td className="text-center">
											{!forCompliance && (
												<Dropdown
													bordered
													dropdownWidth="180px"
													right={0}
													top={100}
													renderButton={({ setOpen, open }) => (
														<button
															onClick={() => setOpen(!open)}
															className="w-[35px] h-[35px] rounded-full flex items-center justify-center">
															<Kebab />
														</button>
													)}
													items={[
														<ViewCampaign campaignId={d.id} />,
														...(canDeleteCampaign ? [<DeleteCampaign campaignId={d.id} />] : []),
													]}
													renderItem={({ item, index }) => (
														<div className="w-full" key={index}>
															{item}
														</div>
													)}
												/>
											)}
											{forCompliance && (
												<div className="flex items-center justify-center">
													<Link href={"/reports/compliance/" + d.id}>
														<AppButton
															className="!w-[118px]"
															fullyRounded
															label="View Report"
														/>
													</Link>
												</div>
											)}
										</td>
									</tr>
							  ))
							: <EmptyTableRow colSpan={6} />}
					</tbody>
				</table>
			</div>
			{(isLoading || isFetching || data?.data?.length > 0) && <div className="my-8 flex items-center justify-center md:justify-end px-5 md:px-10">
					<Pagination
						currentPage={currentPage}
						totalPages={data?.totalPages ?? (isLoading || isFetching ? 2 : 1)}
						setCurrentPage={setCurrentPage}
					/>
				</div>}
		</div>
	);
}
