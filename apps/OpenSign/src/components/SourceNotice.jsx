import React from "react";
import { useTranslation } from "react-i18next";
import { getRuntimeConfig } from "../constant/runtimeConfig";

const OPEN_SIGN_SOURCE_URL = "https://github.com/OpenSignLabs/OpenSign";

// AGPL-3.0 section 13: a modified OpenSign served over a network must offer its users the
// Corresponding Source. Rebranded deployments (any brandKey other than "opensign") show this
// notice; set runtime config urls.github to the deployment's own source repository.
const SourceNotice = ({ className = "" }) => {
  const { t } = useTranslation();
  const { brandKey, urls } = getRuntimeConfig();
  if (brandKey === "opensign") return null;

  const sourceUrl = (urls.github || OPEN_SIGN_SOURCE_URL).replace(/\/+$/, "");
  const linkProps = {
    target: "_blank",
    rel: "noopener noreferrer",
    className: "underline hover:no-underline"
  };
  return (
    <p className={`os-source-notice text-[12px] opacity-80 ${className}`}>
      {t("powered-by", "Powered by")}{" "}
      <a href={OPEN_SIGN_SOURCE_URL} {...linkProps}>
        OpenSign
      </a>
      {" · "}
      <a href={sourceUrl} {...linkProps}>
        {t("source-code", "Source code")}
      </a>
      {" · "}
      <a href={`${sourceUrl}/blob/main/LICENSE`} {...linkProps}>
        {t("license", "License")} (AGPL-3.0)
      </a>
    </p>
  );
};

export default SourceNotice;
