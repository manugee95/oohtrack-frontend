import ResetUserPassword from "@/components/shared/ResetUserPassword";

export default function ResetFieldAuditorPassword({ userId }: { userId: number | string }) {
	return <ResetUserPassword userId={userId} />;
}
