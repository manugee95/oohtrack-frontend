"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiInstance } from "@/utils";
import useCredentials from "@/hooks/useCredentials";
import { City, State } from "@/types";
import CloseIcon from "@/components/shared/icons/CloseIcon";

export default function CitiesCovered({
	selectedStates,
	selectedCities,
	addCity,
	removeCity,
}: {
	selectedStates: number[];
	selectedCities: number[];
	addCity: (cityId: number) => void;
	removeCity: (cityId: number) => void;
}) {
	const { accessToken } = useCredentials();
	const { data: statesData } = useQuery({
		queryKey: ["states"],
		queryFn: async () => {
			const response = await ApiInstance.get("/states", {
				headers: { "auth-token": accessToken },
			});
			return response.data;
		},
		gcTime: Infinity,
	});
	const { data, isLoading, isError } = useQuery({
		queryKey: ["cities"],
		queryFn: async () => {
			const response = await ApiInstance.get("/cities", {
				headers: { "auth-token": accessToken },
			});
			return response.data;
		},
		gcTime: Infinity,
	});

	const cities: City[] = Array.isArray(data) ? data : [];
	const states: State[] = Array.isArray(statesData) ? statesData : [];
	const coveredCities = cities.filter((city) =>
		selectedStates.includes(Number(city.stateId))
	);

	return (
		<div className="w-full flex flex-col gap-y-5">
			<span className="text-2xl font-semibold">Cities Covered</span>
			{selectedStates.length === 0 ? (
				<p className="text-2xl text-[#8D8D8D]">Select states first to choose cities.</p>
			) : isLoading ? (
				<p className="text-2xl text-[#8D8D8D]">Loading cities...</p>
			) : isError ? (
				<p className="text-2xl text-primary">Could not load cities. Please try again.</p>
			) : coveredCities.length === 0 ? (
				<p className="text-2xl text-[#8D8D8D]">No cities are available under the selected states.</p>
			) : (
				<div className="flex flex-col gap-y-5">
					{selectedStates.map((stateId) => {
						const stateCities = coveredCities.filter(
							(city) => Number(city.stateId) === stateId
						);
						if (!stateCities.length) return null;
						const stateName = states.find((state) => state.id === stateId)?.name;
						return (
							<div key={stateId} className="flex flex-col gap-y-3">
								<span className="text-2xl font-medium">{stateName}</span>
								<div className="flex items-center flex-wrap gap-3">
									{stateCities.map((city) => {
									const cityId = Number(city.id);
									const isSelected = selectedCities.includes(cityId);
									return (
										<button
											key={cityId}
											type="button"
											onClick={() => isSelected ? removeCity(cityId) : addCity(cityId)}
											className={`p-3 min-w-[90px] w-max h-[34px] rounded-xl flex items-center justify-center gap-3 ${isSelected ? "bg-primary text-white border-primary" : "border-[#E9E9E9]"} border-[1.5px] text-2xl`}>
											{city.name}
											{isSelected && <CloseIcon width="14" height="14" fill="white" />}
										</button>
									);
									})}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
