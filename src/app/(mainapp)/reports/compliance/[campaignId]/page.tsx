import ComplianceReportHeader from "@/components/page_components/reports/compliance/ComplianceReportHeader";
import ComplianceReportTable from "@/components/page_components/reports/compliance/ComplianceReportTable";
import React from "react";

export default async function page() {
	return (
		<>
			<ComplianceReportHeader />
			<section className="w-full bg-white rounded-2xl border border-[#E2E2E2] min-h-[70vh] h-max">
				<ComplianceReportTable />
			</section>
		</>
	);
}
