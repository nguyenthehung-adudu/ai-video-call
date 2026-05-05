"use client";

import React from "react";
import Image from "next/image";
import { Loader2, Check, X, AlertCircle, User } from "lucide-react";
import { VerifyUserResult } from "@/actions/verify-clerk-user";
import { EmailVerificationStatus } from "@/hooks/useVerifyEmails";

interface VerifiedEmailItemProps {
  email: string;
  status: EmailVerificationStatus;
  result?: VerifyUserResult;
}

const VerifiedEmailItem: React.FC<VerifiedEmailItemProps> = ({
  email,
  status,
  result,
}) => {
  const renderStatus = () => {
    switch (status) {
      case "checking":
        return (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-sm text-gray-400">Đang kiểm tra...</span>
          </div>
        );
      case "valid":
        return (
          <div className="flex items-center gap-3">
            {result?.imageUrl ? (
              <Image
                src={result.imageUrl}
                alt={result.fullName || email}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600">
                <User className="h-4 w-4 text-white" />
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-green-500">
                {result?.fullName || "User"}
              </span>
              <span className="text-xs text-gray-400">{email}</span>
            </div>
            <Check className="h-4 w-4 text-green-500" />
          </div>
        );
      case "invalid":
        return (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600">
              <X className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-red-500">Không tìm thấy</span>
              <span className="text-xs text-gray-400">{email}</span>
            </div>
            <X className="h-4 w-4 text-red-500" />
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <span className="text-sm text-yellow-500">
              {result?.error || "Lỗi xác minh"}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  const borderColor = {
    idle: "border-transparent",
    checking: "border-blue-500",
    valid: "border-green-500",
    invalid: "border-red-500",
    error: "border-yellow-500",
  }[status];

  return (
    <div
      className={`flex items-center rounded-lg border bg-dark-3 p-2 transition-all ${borderColor}`}
    >
      {renderStatus()}
    </div>
  );
};

interface EmailVerificationListProps {
  emails: string[];
  getStatus: (email: string) => EmailVerificationStatus;
  getUserInfo: (email: string) => VerifyUserResult | undefined;
  isChecking?: boolean;
}

export const EmailVerificationList: React.FC<EmailVerificationListProps> = ({
  emails,
  getStatus,
  getUserInfo,
  isChecking,
}) => {
  if (emails.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-sky-2">
          Người dùng đã mời ({emails.length})
        </span>
        {isChecking && (
          <span className="text-xs text-gray-400">
            <Loader2 className="inline h-3 w-3 animate-spin" /> Đang xác minh...
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {emails.map((email) => (
          <VerifiedEmailItem
            key={email}
            email={email}
            status={getStatus(email)}
            result={getUserInfo(email)}
          />
        ))}
      </div>
    </div>
  );
};

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  onEmailAdded: (email: string) => void;
  placeholder?: string;
  invalidEmails?: string[];
}

export const EmailInput: React.FC<EmailInputProps> = ({
  value,
  onChange,
  onEmailAdded,
  placeholder = "Nhập email và nhấn Enter để thêm",
  invalidEmails = [],
}) => {
  const [inputValue, setInputValue] = React.useState("");
  const [showAddButton, setShowAddButton] = React.useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setShowAddButton(newValue.includes("@"));
  };

  const handleAddEmail = () => {
    const email = inputValue.trim().toLowerCase();
    if (email && email.includes("@")) {
      onEmailAdded(email);
      setInputValue("");
      setShowAddButton(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    }
  };

  // Determine border color based on input
  let borderColor = "border-transparent";
  if (inputValue && inputValue.includes("@")) {
    if (inputValue.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      borderColor = "border-blue-500"; // Valid format, pending verification
    } else {
      borderColor = "border-red-500"; // Invalid format
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="email"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0 ${borderColor}`}
        />
        {showAddButton && (
          <button
            type="button"
            onClick={handleAddEmail}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Thêm
          </button>
        )}
      </div>
      {invalidEmails.length > 0 && (
        <p className="text-xs text-red-400">
          Không thể mời: {invalidEmails.join(", ")}
        </p>
      )}
    </div>
  );
};

// Import Input from ui/input
import { Input } from "./ui/input";

export default VerifiedEmailItem;
