"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import AppLoader from "@/components/shared/AppLoader";
import EmptyState from "@/components/shared/EmptyState";
import useCredentials from "@/hooks/useCredentials";
import { ApiInstance } from "@/utils";

const entityEndpoints = [
	{ label: "Structures", endpoint: "/structure" },
	{ label: "Posters", endpoint: "/poster" },
	{ label: "Illuminations", endpoint: "/illumination" },
	{ label: "Routes", endpoint: "/route" },
	{ label: "Sides", endpoint: "/side" },
] as const;

type EntityRecord = {
	id?: number | string;
	name: string;
};

function ComplianceEntityList({
	label,
	endpoint,
}: (typeof entityEndpoints)[number]) {
	const { accessToken } = useCredentials();
	const { data, isLoading, isError } = useQuery({
		queryKey: ["complianceEntities", endpoint],
		queryFn: async () => {
			const response = await ApiInstance.get(endpoint, {
				headers: { "auth-token": accessToken },
			});
			const result = response.data;
			const pluralKey = label.toLowerCase();
			const singularKey = endpoint.slice(1);
			const candidates = [
				result,
				result?.data,
				result?.[pluralKey],
				result?.[singularKey],
				result?.data?.[pluralKey],
				result?.data?.[singularKey],
				result?.data?.data,
				result?.data?.data?.[pluralKey],
				result?.entities,
				result?.data?.entities,
				result?.rows,
				result?.data?.rows,
				result?.results,
				result?.data?.results,
			];
			const entityList = candidates.find(Array.isArray);
			if (entityList) return entityList;
			const entity = result?.entity ?? result?.data?.entity ?? result?.data;
			return entity?.id != null ? [entity] : result?.id != null ? [result] : [];
		},
	});

	return (
		<section className="rounded-xl border border-[#E2E2E2] p-6">
			<h3 className="text-2xl font-bold mb-4">{label}</h3>
			{isLoading ? (
				<div className="flex justify-center py-6"><AppLoader size={28} /></div>
			) : isError ? (
				<p className="text-2xl text-primary">Could not load {label.toLowerCase()}.</p>
			) : data?.length ? (
				<ul className="flex flex-col">
					{data.map((entity: EntityRecord, index: number) => (
						<li
							key={entity.id ?? `${entity.name}-${index}`}
							className="border-b border-[#E2E2E2] py-3 text-2xl last:border-0">
							{entity.name}
						</li>
					))}
				</ul>
			) : (
				<EmptyState />
			)}
		</section>
	);
}

export default function ComplianceEntitiesList() {
	return (
		<div className="mt-10">
			<h2 className="text-[2.4rem] font-bold mb-6">Existing entities</h2>
			<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
				{entityEndpoints.map((entityType) => (
					<ComplianceEntityList key={entityType.endpoint} {...entityType} />
				))}
			</div>
		</div>
	);
}
