"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import EmptyState from "@/components/shared/EmptyState";
import useCredentials from "@/hooks/useCredentials";
import { ApiInstance } from "@/utils";
import { Industry } from "@/types";

export default function IndustriesList() {
	const { accessToken } = useCredentials();
	const { data, isLoading, isError } = useQuery({
		queryKey: ["industries"],
		queryFn: async () => {
			const response = await ApiInstance.get("/api/industries", {
				headers: { "auth-token": accessToken },
			});
			return response.data;
		},
	});
	const industries: Industry[] = Array.isArray(data)
		? data
		: Array.isArray(data?.data)
			? data.data
			: [];

	return (
		<div className="h-full flex flex-col px-8 py-6">
			{isLoading ? (
				<p className="text-2xl text-[#8D8D8D]">Loading industries...</p>
			) : isError ? (
				<p className="text-2xl text-primary">Could not load industries.</p>
			) : industries.length ? (
				industries.map((industry) => (
					<div
						key={industry.id ?? industry.name}
						className="text-[1.7rem] py-[10px] border-b border-b-gray-100 font-medium">
						{industry.name}
					</div>
				))
			) : (
				<EmptyState />
			)}
		</div>
	);
}
