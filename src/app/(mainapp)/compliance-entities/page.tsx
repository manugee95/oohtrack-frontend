import React from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import ComplianceEntitiesForm from "@/components/page_components/compliance-entities/ComplianceEntitiesForm";
import ComplianceEntitiesList from "@/components/page_components/compliance-entities/ComplianceEntitiesList";
import { ACCESS_TOKEN_COOKIE_NAME } from "@/constants";
import { ApiInstance } from "@/utils";

export default async function ComplianceEntitiesPage() {
	const cookieStore = await cookies();
	const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
	if (!accessToken) notFound();

	let role: string | undefined;
	try {
		const response = await ApiInstance.get("/user/detail", {
			headers: { "auth-token": accessToken },
		});
		role = response.data?.role;
	} catch {
		notFound();
	}
	if (!["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"].includes(role ?? "")) notFound();

	return (
		<>
			<section className="w-full h-[10rem] flex items-center">
				<h1 className="text-[2rem] md:text-[3rem] font-black">
					Compliance Entities
				</h1>
			</section>
			<section className="bg-white rounded-2xl border border-[#E2E2E2] min-h-[50vh] h-max p-5 md:p-12">
				<ComplianceEntitiesForm />
				<ComplianceEntitiesList />
			</section>
		</>
	);
}
