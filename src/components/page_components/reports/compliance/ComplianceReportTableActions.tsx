"use client";
import AppButton from "@/components/shared/AppButton";
import React from "react";
import PrintIcon from "@/components/shared/icons/PrintIcon";
import ExportIcon from "@/components/shared/icons/ExportIcon";
import ChevronIcon from "@/components/shared/icons/ChevronIcon";
import Dropdown from "@/components/shared/Dropdown";
import { downloadExcelReport } from "@/utils/excelReport";

export default function ComplianceReportTableActions({
	reports,
}: {
	reports: any;
}) {
	return (
		<div className="p-8 flex flex-col gap-y-5 md:flex-row md:items-center justify-between">
			<div className="flex items-center gap-x-8">
				<div className="w-[40px] xl:w-[100px]">
					<AppButton
						className="!bg-transparent border-primary border-[1.5px] !h-[40px]"
						fullyRounded>
						<div className="flex items-center gap-x-3">
							<PrintIcon />
							<span className="hidden xl:flex text-2xl font-medium text-primary">
								Print
							</span>
						</div>
					</AppButton>
				</div>
				<div className="w-[150px]">
					<Dropdown
						renderButton={({ setOpen, open }) => (
							<AppButton
								onClick={() => setOpen(!open)}
								className="!bg-appBlack !h-[40px]"
								fullyRounded>
								<div className="flex items-center gap-x-5">
									<ExportIcon />
									<span className="text-2xl font-medium text-white">
										Export
									</span>
									<div
										className={`${
											open ? "rotate-180" : "rotate-0"
										} transition-all duration-200`}>
										<ChevronIcon />
									</div>
								</div>
							</AppButton>
						)}
						items={[
							<button
								onClick={() => void downloadExcelReport("Cleaned_Data.xlsx", reports)}
								className="w-full h-full text-2xl font-medium"
								key="">
								Excel
							</button>,
							<button className="w-full h-full text-2xl font-medium" key="">
								PDF
							</button>,
						]}
						renderItem={({ item, index }) => {
							return (
								<div
									className="w-full h-[35px] flex items-center px-[10px] hover:bg-[#f5f5f5] border-b border-b-gray-300"
									key={index}>
									{item}
								</div>
							);
						}}
					/>
				</div>
			</div>
		</div>
	);
}
