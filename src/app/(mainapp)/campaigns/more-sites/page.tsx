import React from "react";
import CreateCampaignForm from "@/components/page_components/campaigns/create/CreateCampaignForm";

export default function AddSitesPage() {
	return (
		<section className="flex min-h-screen items-center justify-center py-12 xl:py-0">
			<CreateCampaignForm forAddMore />
		</section>
	);
}
