"use client";
import React, { useState } from "react";
import EditIcon from "@/components/shared/icons/EditIcon";
import Modal from "@/components/shared/Modal";
import { FieldAuditor } from "@/types";
import { useRootStore } from "@/components/shared/providers/RootProvider";
import CreateFieldAuditorForm from "./create/CreateFieldAuditorForm";
import { useQueryClient } from "@tanstack/react-query";

export default function EditFieldAuditor({
	fieldAuditor,
}: {
	fieldAuditor: FieldAuditor;
}) {
	const { userDetails } = useRootStore();
	const queryClient = useQueryClient();

	const [showEdit, setShowEdit] = useState(false);
	const stateIds = (fieldAuditor.statesCovered ?? []).map((state) =>
		typeof state === "number" ? state : state.id
	).filter((id): id is number => typeof id === "number");
	const cityIds = (fieldAuditor.citiesCovered ?? []).map((city) =>
		typeof city === "number" ? city : city.id
	).filter((id): id is number => typeof id === "number");

	if (!["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"].includes(userDetails?.role!)) {
		return;
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setShowEdit(true)}
				className="w-full flex items-center gap-x-5 text-2xl py-3 border-b-[#E3E3E3] border-b">
				<EditIcon />
				Edit Account Info
			</button>
			<Modal showModal={showEdit} hideModal={() => setShowEdit(false)}>
				<CreateFieldAuditorForm
					initialValues={{
						...fieldAuditor,
						statesCovered: stateIds,
						citiesCovered: cityIds,
						phone: fieldAuditor.phone ?? "",
					}}
					isEditing
					editCallback={async (updatedAuditor) => {
						queryClient.setQueriesData(
							{ queryKey: ["fieldAuditors"] },
							(previous: any) => {
								const updateRecords = (records: any[]) =>
									records.map((auditor) =>
										Number(auditor.id) === Number(fieldAuditor.id)
											? { ...auditor, ...updatedAuditor }
											: auditor
									);
								if (Array.isArray(previous?.data)) {
									return { ...previous, data: updateRecords(previous.data) };
								}
								if (Array.isArray(previous?.data?.data)) {
									return {
										...previous,
										data: { ...previous.data, data: updateRecords(previous.data.data) },
									};
								}
								return previous;
							}
						);
						setShowEdit(false);
						void queryClient.invalidateQueries({ queryKey: ["fieldAuditors"] });
					}}
				/>
			</Modal>
		</>
	);
}
