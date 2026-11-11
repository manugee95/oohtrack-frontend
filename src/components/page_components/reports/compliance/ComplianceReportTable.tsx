"use client";
import React, { useState } from "react";
import ComplianceReportTableActions from "./ComplianceReportTableActions";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ApiInstance } from "@/utils";
import useCredentials from "@/hooks/useCredentials";
import { AxiosError } from "axios";
import ComplianceReportPlaceholder from "@/components/shared/ComplianceReportPlaceholder";
import EmptyTableRow from "@/components/shared/EmptyTableRow";
import { downloadExcelReport, formatCapturedDate } from "@/utils/excelReport";
import useAlert from "@/hooks/useAlert";

function getComplianceRows(responseData: any) {
	return Array.isArray(responseData?.data)
		? responseData.data
		: Array.isArray(responseData?.data?.data)
			? responseData.data.data
			: [];
}

function toComplianceExportRow(report: any, index: number) {
	return {
		SN: index + 1,
		Code: report.siteCode,
		State: "Abia",
		City: report.city,
		Address: report.address,
		Brand: report.brand,
		"Board Type": report.boardType,
		"Media Owner": report.mediaOwner,
		message: report.message,
		Latitude: report.latitude,
		Longitude: report.longitude,
		"Close Shot URL": report.closeShotUrl
			? { text: "View Photo", hyperlink: report.closeShotUrl }
			: "",
		"Long Shot URL": report.longShotUrl
			? { text: "View Photo", hyperlink: report.longShotUrl }
			: "",
		Poster: report.Poster?.name ?? "-",
		Structure: report.Structure?.name ?? "-",
		Route: report.Route?.name ?? "-",
		Illumination: report.Illumination?.name ?? "-",
		Side: report.Side?.name ?? "-",
		BSV: report.bsv,
		Remark: report.comment,
		"Date Captured": formatCapturedDate(report.dateCaptured),
	};
}

export default function ComplianceReportTable() {
	const params = useParams<{ campaignId: string }>();
	const { accessToken } = useCredentials();
	const { showAndHideAlert } = useAlert();
	const [isExporting, setIsExporting] = useState(false);

	async function fetchComplianceReports() {
		const response = await ApiInstance.get(
			`/view-campaign-compliance/${params.campaignId}`,
			{
				headers: {
					"auth-token": accessToken,
				},
			}
		);
		return response.data;
	}

	const { data, isLoading, error, isFetching } = useQuery({
		queryKey: ["compliance-reports", params.campaignId],
		queryFn: fetchComplianceReports,
	});

	if (error && error instanceof AxiosError && error.response?.status === 404) {
		throw new Error(error.response.data.message);
	}

	const reportRows = getComplianceRows(data);

	async function exportCampaignReports() {
		setIsExporting(true);
		try {
			if (!reportRows.length) {
				throw new Error("No campaign report records are available to export.");
			}
			await downloadExcelReport(
				"Cleaned_Data.xlsx",
				reportRows.map(toComplianceExportRow)
			);
		} catch (exportError) {
			const message =
				exportError instanceof Error
					? exportError.message
				: "Could not generate the complete campaign report.";
			showAndHideAlert({ message, type: "error" });
		} finally {
			setIsExporting(false);
		}
	}

	return (
		<div className="w-full h-full flex flex-col">
			{reportRows.length > 0 && (
				<ComplianceReportTableActions
					onExport={() => void exportCampaignReports()}
					isExporting={isExporting}
				/>
			)}
			<div className="w-full overflow-x-auto">
				<table className="w-[250%] md:w-[180%]" cellPadding={15}>
					<thead className="border-b border-t border-[#C7C7C7] border-t-[#C7C7C7] bg-[#f5f5f5]">
						<tr>
							<th className="text-center ">
								<span className="text-2xl font-semibold">SN</span>
							</th>
							<th className="text-center ">
								<span className="text-2xl font-semibold">Code</span>
							</th>
							<th>
								<span className="text-2xl font-semibold">State</span>
							</th>
							<th>
								<span className="text-2xl font-semibold">City</span>
							</th>
							<th className="w-[215px] text-left">
								<span className="text-2xl font-semibold w-full">Address</span>
							</th>
							<th>
								<span className="text-2xl font-semibold">Brand</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Board Type</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Media Owner</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Message</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Poster</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Structure</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Route</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Illumination</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Side</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">BSV</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Remark</span>
							</th>
							<th className="">
								<span className="text-2xl font-semibold">Date Captured</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{(isLoading || isFetching) &&
							[...Array(5)].map((d, i) => (
								<ComplianceReportPlaceholder key={i} />
							))}

						{!isLoading &&
							!isFetching &&
							reportRows.length > 0 &&
							reportRows.map((d: any, i: number) => (
								<tr
									key={i}
									className="border-b-[#E6E6E6] border-b 
                        ">
									<td className="text-center">
										<span className="text-2xl font-medium">{i + 1}</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">{d.siteCode}</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">{d.state}</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">{d.city}</span>
									</td>
									<td className="">
										<span className="text-2xl font-medium">{d.address}</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium text-center">
											{d.brand}
										</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">{d.boardType}</span>
									</td>

									<td className="text-center">
										<span className="text-2xl font-medium">{d.mediaOwner}</span>
									</td>

									<td className="text-center">
										<span className="text-2xl font-medium">{d.message}</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">
											{d.Poster?.name ?? "-"}
										</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">
											{d.Structure?.name ?? "-"}
										</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">{d.Route?.name ?? "-"}</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">
											{d.Illumination?.name ?? "-"}
										</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">{d.Side?.name ?? "-"}</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">{d.bsv}</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">{d.comment}</span>
									</td>
									<td className="text-center">
										<span className="text-2xl font-medium">
											{new Date(d.uploadedAt).toLocaleDateString("en-US", {
												dateStyle: "medium",
											})}
										</span>{" "}
										<br />
										<span className="text-2xl font-medium">
											{new Date(d.uploadedAt)
												.toLocaleTimeString("en-US", {
													hour: "2-digit",
													minute: "2-digit",
													hour12: true,
												})
												.replace(" AM", ":am")
												.replace(" PM", ":pm")}
										</span>
									</td>
								</tr>
							))}
		{!isLoading && !isFetching && reportRows.length === 0 && (
							<EmptyTableRow colSpan={17} />
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
