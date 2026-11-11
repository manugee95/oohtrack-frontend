"use client";
import React, { useState } from "react";
import AppButton from "@/components/shared/AppButton";
import CompetitiveReportTableActions from "./CompetitiveReportTableActions";
import { useParams } from "next/navigation";
import useCredentials from "@/hooks/useCredentials";
import { useQuery } from "@tanstack/react-query";
import { ApiInstance, getHumanReadableAddress } from "@/utils";
import CampaignPlaceholder from "@/components/shared/CampaignPlaceholder";
import EmptyTableRow from "@/components/shared/EmptyTableRow";
import { CompetitiveUpload } from "@/types";
import Link from "next/link";
import Portal from "@/components/shared/Portal";
import { formatCapturedDate } from "@/utils/excelReport";
import { downloadExcelReport } from "@/utils/excelReport";
import Pagination from "@/components/shared/Pagination";
import useAlert from "@/hooks/useAlert";

const REPORTS_PER_PAGE = 10;

function getReportRows(data: any): CompetitiveUpload[] {
	const rows =
		data?.advertiserHasComplianceReport ??
		data?.advertiserCompetitiveData ??
		data?.data?.advertiserHasComplianceReport ??
		data?.data?.advertiserCompetitiveData ??
		data?.reports ??
		data?.data?.reports;
	return Array.isArray(rows) ? rows : [];
}

function getReportTotalPages(data: any, rowCount: number, currentPage: number) {
	const reportedPages =
		data?.totalPages ??
		data?.total_pages ??
		data?.lastPage ??
		data?.pagination?.totalPages ??
		data?.pagination?.total_pages ??
		data?.pagination?.lastPage ??
		data?.data?.totalPages ??
		data?.data?.pagination?.totalPages ??
		data?.meta?.totalPages;
	if (Number.isFinite(Number(reportedPages)) && Number(reportedPages) > 0) {
		return Number(reportedPages);
	}

	const totalRecords =
		data?.pagination?.totalRecords ??
		data?.pagination?.total ??
		data?.totalRecords ??
		data?.totalCount ??
		data?.total ??
		data?.data?.pagination?.totalRecords ??
		data?.data?.totalRecords ??
		data?.meta?.total;
	const limit =
		data?.pagination?.limit ??
		data?.limit ??
		data?.data?.pagination?.limit ??
		data?.data?.limit ??
		REPORTS_PER_PAGE;
	if (Number.isFinite(Number(totalRecords)) && Number(limit) > 0) {
		return Math.max(1, Math.ceil(Number(totalRecords) / Number(limit)));
	}
	return rowCount >= REPORTS_PER_PAGE ? currentPage + 1 : currentPage;
}

export default function CompetitiveReportTable() {
	const params = useParams();
	const { accessToken } = useCredentials();
	const { showAndHideAlert } = useAlert();
	const [currentPage, setCurrentPage] = useState(1);
	const [search, setSearch] = useState("");
	const [isExporting, setIsExporting] = useState(false);

	async function fetchReportPage(page: number) {
		const response = await ApiInstance.get(
			`/competitive-map/${params.advertiserId}?page=${page}&limit=${REPORTS_PER_PAGE}&search=${encodeURIComponent(search)}`,
			{
				headers: {
					"auth-token": accessToken,
				},
			}
		);
		return response.data;
	}

	function toExportRow(report: CompetitiveUpload) {
		return {
			Advertiser: report.advertiser.name,
			Brand: report.brand.name,
			Board: report.boardType.name,
			Category: report.category.name,
			Address: report.address,
			City: report.city.name,
			State: report.state.name,
			Region: report.region.name,
			Latitude: report.latitude,
			Longitude: report.longitude,
			"Close Shot URL": report.closeShotUrl
				? { text: "View Photo", hyperlink: report.closeShotUrl }
				: "",
			"Long Shot URL": report.longShotUrl
				? { text: "View Photo", hyperlink: report.longShotUrl }
				: "",
			"Date Captured": formatCapturedDate(report.dateCaptured),
		};
	}

	const { data, isLoading, isFetching } = useQuery({
		queryKey: ["advertisers", currentPage, search, params.advertiserId],
		queryFn: async () => {
			const responseData = await fetchReportPage(currentPage);
			const reports = getReportRows(responseData);
			const reportsWithAddress = await Promise.all(
				reports.map(async (report) => {
					const LatLng = JSON.parse(report?.geolocations);
					const address = await getHumanReadableAddress({
						lat: LatLng[0].latitude,
						lng: LatLng[0].longitude,
					});
					return { ...report, address };
				})
			);

			return { ...responseData, reports: reportsWithAddress };
		},
		retry: false,
	});

	const dataToDisplay: CompetitiveUpload[] = data?.reports ?? [];

	const totalPages = getReportTotalPages(data, dataToDisplay.length, currentPage);
	const totalUploads =
		data?.pagination?.totalRecords ??
		data?.totalRecords ??
		data?.totalCount ??
		data?.total ??
		dataToDisplay.length;

	async function exportAllReports() {
		setIsExporting(true);
		try {
			const allReports: CompetitiveUpload[] = [];
			const seenPageSignatures = new Set<string>();
			let expectedPages = 1;

			for (let page = 1; page <= 1000; page += 1) {
				const pageData = await fetchReportPage(page);
				const pageReports = getReportRows(pageData);
				if (!pageReports.length) break;

				const signature = pageReports
					.map((report) => report.id ?? JSON.stringify(report))
					.join("|");
				if (seenPageSignatures.has(signature)) {
					throw new Error(
						`The API returned the same report records for page ${page}. The full report could not be generated.`
					);
				}
				seenPageSignatures.add(signature);
				allReports.push(...pageReports);
				expectedPages = getReportTotalPages(pageData, pageReports.length, page);
				if (page >= expectedPages || pageReports.length < REPORTS_PER_PAGE) break;
			}

			if (!allReports.length) {
				throw new Error("No report records are available to export.");
			}

			const reportsWithAddress = await Promise.all(
				allReports.map(async (report) => {
					if (report.address) return report;
					const LatLng = JSON.parse(report.geolocations);
					const address = await getHumanReadableAddress({
						lat: LatLng[0].latitude,
						lng: LatLng[0].longitude,
					});
					return { ...report, address };
				})
			);
			await downloadExcelReport(
				"Competitive_Report.xlsx",
				reportsWithAddress.map(toExportRow)
			);
		} catch (exportError) {
			const message =
				exportError instanceof Error
					? exportError.message
					: "Could not generate the complete report.";
			showAndHideAlert({ message, type: "error" });
		} finally {
			setIsExporting(false);
		}
	}

	return (
		<div className="h-full flex flex-col">
			<CompetitiveReportTableActions
				onExport={() => void exportAllReports()}
				isExporting={isExporting}
			/>

			<Portal elementId="advertiser-name">
				{dataToDisplay.length > 0 && (
					<>
						<span className="text-[1.7rem] font-bold">
							{dataToDisplay[0]?.advertiser.name}
						</span>
						<span className="flex h-[24px] w-[1px] bg-appBlack"></span>
						<span className="text-[1.7rem] font-medium">
							Total Uploads:{" "}
							<span className="font-bold">{totalUploads}</span>
						</span>
					</>
				)}
			</Portal>

			<div className="w-full overflow-x-auto">
				<table className="w-[250%] md:w-[150%] xl:w-full" cellPadding={15}>
					<thead className="border-b border-t border-[#C7C7C7] border-t-[#C7C7C7] bg-[#f5f5f5]">
						<tr>
							<th className="text-center ">
								<span className="text-2xl font-semibold">Advertiser</span>
							</th>
							<th>
								<span className="text-2xl font-semibold">Brand</span>
							</th>
							<th>
								<span className="text-2xl font-semibold">Board</span>
							</th>
							<th>
								<span className="text-2xl font-semibold">Category</span>
							</th>
							<th className="w-[215px] text-left">
								<span className="text-2xl font-semibold w-full">Address</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">City</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">State</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Region</span>
							</th>
							<th className="text-center"></th>
						</tr>
					</thead>
					<tbody>
						{(isLoading || isFetching) &&
							[...Array(5)].map((d, i) => <CampaignPlaceholder key={i} />)}

						{!isLoading &&
							!isFetching &&
							(dataToDisplay.length > 0 ? dataToDisplay.map((d: CompetitiveUpload, i: number) => (
								<tr
									key={i}
									className="border-b-[#E6E6E6] border-b 
                        ">
									<td className="text-center">
										<span className="text-2xl font-medium">
											{d.advertiser.name}
										</span>
									</td>

									<td className="text-center">
										<span className="text-2xl font-medium">{d.brand.name}</span>
									</td>

									<td className="text-center">
										<span className="text-2xl font-medium">
											{d.boardType.name}
										</span>
									</td>

									<td className="text-center">
										<span className="text-2xl font-medium">
											{d.category.name}
										</span>
									</td>

									<td className="">
										<span className="text-2xl font-medium">{d.address}</span>
									</td>

									<td className="text-center">
										<span className="text-2xl font-medium text-center">
											{d.city.name}
										</span>
									</td>

									<td className="text-center">
										<span className="text-2xl font-medium">{d.state.name}</span>
									</td>

									<td className="text-center">
										<span className="text-2xl font-medium">
											{d.region.name}
										</span>
									</td>

									<td className="text-center">
										<div className="flex items-center justify-center">
											<Link href={`/reports/competitive/details/${d.id}`}>
												<AppButton
													className="!w-[118px]"
													fullyRounded
													label="View"
												/>
											</Link>
										</div>
									</td>
								</tr>
							)) : <EmptyTableRow colSpan={9} />)}
					</tbody>
				</table>
			</div>
			{!isLoading && totalPages > 1 && (
				<div className="my-12 flex items-center justify-center md:justify-end px-5 md:px-10">
					<Pagination
						currentPage={currentPage}
						totalPages={totalPages}
						setCurrentPage={setCurrentPage}
					/>
				</div>
			)}
		</div>
	);
}
