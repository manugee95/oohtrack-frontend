import ResetUserPassword from "@/components/shared/ResetUserPassword";

export default function ResetAccountManagerPassword({ userId }: { userId: number | string }) {
	return <ResetUserPassword userId={userId} />;
}
