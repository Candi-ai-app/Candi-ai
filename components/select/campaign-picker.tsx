"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { SelectAccount } from "@/components/select/select-account";
import { CampaignCard } from "@/components/select/campaign-card";

export type PickerCampaign = {
  id: string;
  candidate: string;
  office: string | null;
  district: string | null;
  election_date: string | null;
  photo_url: string | null;
};

export function CampaignPicker({
  campaigns,
  canManage,
  email,
}: {
  campaigns: PickerCampaign[];
  /** Owner/director: may create new campaigns and delete existing ones. */
  canManage: boolean;
  email?: string;
}) {
  return (
    <div className="select-screen">
      <div className="select-shell">
        <header className="select-head">
          <div className="select-head-row">
            <div className="brand" style={{ fontSize: 16 }}>
              <span className="brand-mark">C</span>
              Candi <small>v1·MVP</small>
            </div>
            {email ? <SelectAccount email={email} /> : null}
          </div>
          <h1 className="select-title serif">Choose a campaign</h1>
          <p className="muted select-sub">
            {campaigns.length > 0
              ? "Select the campaign you’re working on today."
              : "You don’t have access to any campaigns yet."}
          </p>
        </header>

        <div className="select-grid">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} canManage={canManage} />
          ))}

          {canManage && (
            <Link href="/select/new" className="campaign-card campaign-card-new">
              <span className="campaign-new-icon">
                <Plus />
              </span>
              <span className="campaign-new-label">New campaign</span>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Guided setup with a sample voter file
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
