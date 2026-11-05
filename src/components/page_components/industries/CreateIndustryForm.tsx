"use client";

import React from "react";
import { Form, Formik, FormikHelpers } from "formik";
import * as Yup from "yup";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import AppButton from "@/components/shared/AppButton";
import AppInput from "@/components/shared/AppInput";
import { ApiInstance } from "@/utils";
import useCredentials from "@/hooks/useCredentials";
import useAlert from "@/hooks/useAlert";
import { Industry } from "@/types";

const schema = Yup.object({
	name: Yup.string().trim().required().label("Industry Name"),
});

export default function CreateIndustryForm() {
	const { accessToken } = useCredentials();
	const { showAndHideAlert } = useAlert();
	const router = useRouter();
	const queryClient = useQueryClient();

	const submitHandler = async (
		values: Industry,
		{ setSubmitting }: FormikHelpers<Industry>
	) => {
		try {
			await ApiInstance.post("/api/industries", values, {
				headers: { "auth-token": accessToken },
			});
			await queryClient.invalidateQueries({ queryKey: ["industries"] });
			showAndHideAlert({ message: "Industry created successfully.", type: "success" });
			setSubmitting(false);
			router.push("/industries");
		} catch (error) {
			const err = error as AxiosError<{ error?: string }>;
			showAndHideAlert({
				message: err.response?.data?.error ?? "Could not create industry.",
				type: "error",
			});
			setSubmitting(false);
		}
	};

	return (
		<div className="w-full md:w-[85%] xl:w-[60%] bg-white rounded-2xl border border-[#E2E2E2]">
			<div className="p-5 md:p-12">
				<h1 className="text-[2.8rem] font-extrabold">Add New Industry</h1>
			</div>
			<Formik<Industry>
				initialValues={{ name: "" }}
				validationSchema={schema}
				onSubmit={submitHandler}>
				{({ isSubmitting, isValidating }) => (
					<Form className="w-full flex flex-col gap-y-10 mt-8 px-12 pb-12">
						<AppInput label="Industry Name" name="name" placeholder="Industry Name" />
						<AppButton
							className="font-semibold"
							fullyRounded
							label="Create Industry"
							showLoading={!isValidating && isSubmitting}
						/>
					</Form>
				)}
			</Formik>
		</div>
	);
}
