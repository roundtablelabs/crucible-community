"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Lock, Loader2, CheckCircle } from "lucide-react";
import { apiPost, apiGet } from "@/lib/api/client";
import { logError } from "@/lib/utils/errorHandler";
import { useAuth } from "@/components/providers/AuthProvider";

type User = {
    id: string;
    email: string;
    role: string;
    password_change_required?: boolean;
};

export function PasswordChangeModal() {
    const { token, user } = useAuth();
    const [open, setOpen] = useState(false);
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const checkPasswordStatus = async () => {
            // Need token to check status
            if (!token) return;

            try {
                // Fetch fresh user details including password_change_required
                // Note: user object in context might be stale or missing this field
                const userDetails = await apiGet<User>("/auth/me", { token });
                if (userDetails.password_change_required) {
                    setOpen(true);
                }
            } catch (err) {
                logError(err, "Failed to check password status");
            }
        };

        if (token) {
            checkPasswordStatus();
        }
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError("New passwords do not match");
            return;
        }

        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters long");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await apiPost("/auth/password", {
                token,
                body: {
                    old_password: oldPassword,
                    new_password: newPassword,
                },
            });
            setOpen(false);
            // Reload page to refresh auth state/token if needed, or just let the user continue
            // Ideally update the local user state, but reload is safer to sync everything
            window.location.reload();
        } catch (err) {
            logError(err, "Failed to update password");
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to update password. Please check your current password."
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <Dialog.Root open={open} onOpenChange={() => { }}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[9998] bg-navy-900/90 backdrop-blur-sm" />
                <Dialog.Content
                    onInteractOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                    className="fixed left-1/2 top-1/2 z-[9999] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-base-bg border border-base-divider shadow-2xl flex flex-col pointer-events-auto"
                >
                    <div className="flex items-center justify-between p-6 border-b border-base-divider">
                        <div className="flex items-center gap-3">
                            <Lock className="h-6 w-6 text-gold-400" />
                            <div>
                                <Dialog.Title className="text-xl font-bold text-base-text">
                                    Change Password Required
                                </Dialog.Title>
                                <Dialog.Description className="text-sm text-base-text-secondary">
                                    For your security, you must change your password before continuing.
                                </Dialog.Description>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-base-text mb-1">
                                Current Password
                            </label>
                            <input
                                type="password"
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                                placeholder="Enter current password"
                                required
                                className="w-full px-4 py-2 bg-base-bg border border-base-divider rounded-lg text-base-text focus:outline-none focus:ring-2 focus:ring-gold-500/50"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-base-text mb-1">
                                New Password
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                required
                                className="w-full px-4 py-2 bg-base-bg border border-base-divider rounded-lg text-base-text focus:outline-none focus:ring-2 focus:ring-gold-500/50"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-base-text mb-1">
                                Confirm New Password
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                required
                                className="w-full px-4 py-2 bg-base-bg border border-base-divider rounded-lg text-base-text focus:outline-none focus:ring-2 focus:ring-gold-500/50"
                            />
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full px-6 py-2 bg-gold-500 hover:bg-gold-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Updating Password...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="h-4 w-4" />
                                        Update Password
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
