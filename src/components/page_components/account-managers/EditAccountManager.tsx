"use client";
import React, { useState } from "react";
import EditIcon from "@/components/shared/icons/EditIcon";
import Modal from "@/components/shared/Modal";
import { useRootStore } from "@/components/shared/providers/RootProvider";
import { AccountManager } from "@/types";
import CreateAccountManagerForm from "./create/CreateAccountManagerForm";
import { useQueryClient } from "@tanstack/react-query";

export default function EditAccountManager({
	accountManager,
}: {
	accountManager: AccountManager;
}) {
	const { userDetails } = useRootStore();
	const queryClient = useQueryClient();

	const [showEdit, setShowEdit] = useState(false);

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
				<CreateAccountManagerForm
					initialValues={accountManager}
					isEditing
					editCallback={async (updatedManager) => {
						queryClient.setQueriesData(
							{ queryKey: ["accountManagers"] },
							(previous: any) => {
								const updateRecords = (records: any[]) =>
									records.map((manager) =>
										Number(manager.id) === Number(accountManager.id)
											? { ...manager, ...updatedManager }
											: manager
									);

								if (Array.isArray(previous)) return updateRecords(previous);
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
						void queryClient.invalidateQueries({
							queryKey: ["accountManagers"],
						});
					}}
				/>
			</Modal>
		</>
	);
}
