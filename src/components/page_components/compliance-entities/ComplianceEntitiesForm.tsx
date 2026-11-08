"use client";

import React, { useState } from "react";
import { ErrorMessage, Form, Formik, FormikHelpers } from "formik";
import * as Yup from "yup";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import AppButton from "@/components/shared/AppButton";
import AppInput from "@/components/shared/AppInput";
import ChevronIcon from "@/components/shared/icons/ChevronIcon";
import Dropdown from "@/components/shared/Dropdown";
import useAlert from "@/hooks/useAlert";
import useCredentials from "@/hooks/useCredentials";
import { useRootStore } from "@/components/shared/providers/RootProvider";
import { ApiInstance } from "@/utils";

const entityTypes = [
	{ label: "Structure", endpoint: "/structure" },
	{ label: "Poster", endpoint: "/poster" },
	{ label: "Illumination", endpoint: "/illumination" },
	{ label: "Route", endpoint: "/route" },
	{ label: "Side", endpoint: "/side" },
] as const;

type ComplianceEntityFormValues = {
	entityType: (typeof entityTypes)[number]["label"] | "";
	name: string;
};

type CreatedEntity = {
	name?: string;
	[key: string]: unknown;
};

const schema = Yup.object({
	entityType: Yup.string().oneOf(entityTypes.map(({ label }) => label)).required("Select an entity type"),
	name: Yup.string().trim().required().label("Name"),
});

export default function ComplianceEntitiesForm() {
	const { accessToken } = useCredentials();
	const { userDetails } = useRootStore();
	const { showAndHideAlert } = useAlert();
	const queryClient = useQueryClient();
	const [createdEntity, setCreatedEntity] = useState<CreatedEntity | null>(null);

	if (![
		"SUPER_ADMIN",
		"CHIEF_ACCOUNT_MANAGER",
	].includes(userDetails?.role ?? "")) {
		return (
			<p className="text-2xl text-primary" role="alert">
				Only a super admin or chief account manager can create compliance entities.
			</p>
		);
	}

	const submitHandler = async (
		values: ComplianceEntityFormValues,
		{ setSubmitting, resetForm }: FormikHelpers<ComplianceEntityFormValues>
	) => {
		try {
			const entityType = entityTypes.find(({ label }) => label === values.entityType);
			if (!entityType) return;

			const response = await ApiInstance.post(
				entityType.endpoint,
				{ name: values.name.trim() },
				{
					headers: {
						"auth-token": accessToken,
						"Content-Type": "application/json",
					},
				}
			);

			const entity = response.data?.data ?? response.data?.entity ?? response.data;
			setCreatedEntity({ ...entity, name: entity?.name ?? values.name.trim() });
			showAndHideAlert({ message: `${values.entityType} created successfully.`, type: "success" });
			resetForm();

			try {
				const entitiesResponse = await ApiInstance.get("/entities", {
					headers: { "auth-token": accessToken },
				});
				queryClient.setQueryData(
					["entities", "illuminations"],
					entitiesResponse.data?.data ?? entitiesResponse.data
				);
				await queryClient.invalidateQueries({ queryKey: ["complianceEntities"] });
			} catch {
				await queryClient.invalidateQueries({ queryKey: ["entities"] });
			}
		} catch (error) {
			const err = error as AxiosError<{ error?: string; message?: string }>;
			showAndHideAlert({
				message:
					err.response?.data?.error ??
					err.response?.data?.message ??
					err.message ??
					"Could not create compliance entity.",
				type: "error",
			});
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="w-full max-w-[900px]">
			<h2 className="text-[2.4rem] font-bold mb-8">Create entity</h2>
			<Formik<ComplianceEntityFormValues>
				initialValues={{ entityType: "", name: "" }}
				validationSchema={schema}
				onSubmit={submitHandler}>
				{({ values, setFieldValue, isSubmitting, isValidating }) => (
					<Form className="flex flex-col gap-y-8">
						<div className="w-full">
							<Dropdown
								items={entityTypes.map(({ label }) => label)}
								renderButton={({ setOpen, open }) => (
									<div className="w-full flex flex-col gap-y-4">
										<span className="text-2xl font-semibold">Entity Type</span>
										<button
											type="button"
											onClick={() => setOpen(!open)}
											className="w-full h-[50px] rounded-xl bg-[#F5F5F5] px-8 flex items-center justify-between">
											<span className={`text-2xl ${values.entityType ? "text-appBlack" : "text-[#8D8D8D]"}`}>
												{values.entityType || "Select Entity Type"}
											</span>
											<ChevronIcon fill="#8D8D8D" />
										</button>
									</div>
								)}
								renderItem={({ item, index, setOpen }) => (
									<button
										key={index}
										type="button"
										onClick={() => {
											setFieldValue("entityType", item);
											setOpen(false);
										}}
										className="text-left py-5 text-2xl px-8 border-b border-b-[#cacaca] font-medium last:border-b-0 hover:bg-[#f5f5f5]">
										{item}
									</button>
								)}
							/>
							<ErrorMessage name="entityType" component="p" className="mt-2 text-2xl font-medium text-red-400" />
						</div>
						<AppInput label="Name" name="name" placeholder="Enter entity name" />
						<AppButton
							className="font-semibold"
							fullyRounded
							label="Create Entity"
							showLoading={!isValidating && isSubmitting}
						/>
					</Form>
				)}
			</Formik>
			{createdEntity && (
				<div className="mt-10 rounded-xl border border-[#E2E2E2] bg-[#F5F5F5] p-6" role="status">
					<p className="text-2xl font-semibold">Created entity</p>
					<p className="mt-2 text-2xl">
						{createdEntity.name ?? "Entity created"}
					</p>
					<pre className="mt-4 overflow-auto text-xl">
						{JSON.stringify(createdEntity, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
