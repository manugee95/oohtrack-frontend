"use client";

import React from "react";
import { ErrorMessage, useFormikContext } from "formik";
import { useQuery } from "@tanstack/react-query";
import Dropdown from "@/components/shared/Dropdown";
import ChevronIcon from "@/components/shared/icons/ChevronIcon";
import useCredentials from "@/hooks/useCredentials";
import { ApiInstance } from "@/utils";
import { AdvertiserFormValues, Category } from "@/types";

export default function AdvertiserCategory() {
	const { accessToken } = useCredentials();
	const { values, setFieldValue } = useFormikContext<AdvertiserFormValues>();
	const { data, isLoading, isError } = useQuery({
		queryKey: ["categories", "advertiser-form"],
		queryFn: async () => {
			const headers = { "auth-token": accessToken };
			const firstPage = await ApiInstance.get("/api/categories?page=1", { headers });
			const firstData = firstPage.data;
			if (!Array.isArray(firstData?.data) || !firstData.totalPages || firstData.totalPages <= 1) {
				return firstData;
			}

			const remainingPages = await Promise.all(
				Array.from({ length: firstData.totalPages - 1 }, (_, index) =>
					ApiInstance.get(`/api/categories?page=${index + 2}`, { headers })
				)
			);
			return {
				...firstData,
				data: [
					...firstData.data,
					...remainingPages.flatMap((response) => response.data?.data ?? []),
				],
			};
		},
	});

	const categories: Category[] = Array.isArray(data?.data)
		? data.data
		: Array.isArray(data)
			? data
			: [];
	const selectedCategoryIds = values.categoryIds ?? [];
	const selectedCategories = selectedCategoryIds
		.map((id) =>
			categories.find((category) => Number(category.id) === Number(id)) ??
			values.categories?.find(
				(category): category is Category =>
					typeof category === "object" && Number(category.id) === Number(id)
			)
		)
		.filter((category): category is Category => Boolean(category));

	return (
		<div className="w-full">
			<Dropdown
				items={categories}
				renderButton={({ setOpen, open }) => (
					<div className="w-full flex flex-col gap-y-5">
						<span className="text-2xl font-semibold">Category</span>
						<button
							type="button"
							onClick={() => setOpen(!open)}
							className="w-full h-[50px] rounded-xl bg-[#F5F5F5] px-8 flex items-center justify-between">
							<span className={`text-2xl ${selectedCategories.length ? "text-appBlack" : "text-[#8D8D8D]"}`}>
								{selectedCategories.length
									? selectedCategories.map((category) => category.name).join(", ")
									: isLoading ? "Loading categories..." : "Select Categories"}
							</span>
							<ChevronIcon fill="#8D8D8D" />
						</button>
					</div>
				)}
				renderItem={({ item, index }) => (
					<button
						key={item.id ?? index}
						type="button"
						onClick={() => {
							const isSelected = selectedCategoryIds.some(
								(id) => Number(id) === Number(item.id)
							);
							setFieldValue(
								"categoryIds",
								isSelected
									? selectedCategoryIds.filter((id) => Number(id) !== Number(item.id))
									: [...selectedCategoryIds, item.id]
							);
						}}
						className="text-left py-5 text-2xl px-8 border-b border-b-[#cacaca] font-medium last:border-b-0 hover:bg-[#f5f5f5]">
						{selectedCategoryIds.some((id) => Number(id) === Number(item.id)) ? "[Selected] " : ""}
						{item.name}
					</button>
				)}
			/>
			{isError && <p className="mt-2 text-2xl text-primary">Could not load categories.</p>}
			{!isLoading && !isError && categories.length === 0 && (
				<p className="mt-2 text-2xl text-[#8D8D8D]">No categories are available.</p>
			)}
			<ErrorMessage
				name="categoryIds"
				component="p"
				className="text-2xl font-medium text-red-400"
			/>
		</div>
	);
}
