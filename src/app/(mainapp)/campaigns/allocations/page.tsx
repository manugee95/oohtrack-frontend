import AllocationsHeader from "@/components/page_components/campaigns/allocations/AllocationsHeader";
import AllocationsTable from "@/components/page_components/campaigns/allocations/AllocationsTable";
import React from "react";

export default function page() {
	return (
		<>
			<AllocationsHeader />
			<section className="bg-white rounded-2xl border border-[#E2E2E2] min-h-[70vh] h-max">
				<AllocationsTable />
			</section>
		</>
	);
}
