import React from "react";
import IndustriesHeader from "@/components/page_components/industries/IndustriesHeader";
import IndustriesList from "@/components/page_components/industries/IndustriesList";

export default function IndustriesPage() {
	return (
		<>
			<IndustriesHeader />
			<section className="bg-white rounded-2xl border border-[#E2E2E2] min-h-[70vh] h-max">
				<IndustriesList />
			</section>
		</>
	);
}
