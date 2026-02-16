import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Parse from "parse";
import ReactQuill from "react-quill-new";
import "../../styles/quill.css";
import EditorToolbar, { module1, module2, formats } from "../pdf/EditorToolbar";
import Tooltip from "../../primitives/Tooltip";
import Alert from "../../primitives/Alert";
import Loader from "../../primitives/Loader";
import { withSessionValidation } from "../../utils";

const MailTemplateEditor = ({
  info,
  tenantId,
}) => {
  const appName = localStorage.getItem("appname") || "OpenSign™";
  const { t } = useTranslation();
  const [requestBody, setRequestBody] = useState("");
  const [requestSubject, setRequestSubject] = useState("");
  const [completionBody, setCompletionBody] = useState("");
  const [completionSubject, setCompletionSubject] = useState("");
  const [isDefaultMail, setIsDefaultMail] = useState({
    requestMail: false,
    completionMail: false
  });
  const [isMailLoader, setIsMailLoader] = useState({
    request: false,
    completion: false
  });
  const [brandingConfig, setBrandingConfig] = useState({
    logoUrl: "",
    primaryColor: "#47a3ad",
    footerText: "",
    wrapperHtml: ""
  });
  const [isBrandingLoader, setIsBrandingLoader] = useState(false);
  const [isalert, setIsAlert] = useState({ type: "success", msg: "" });
  const defaultRequestSubject = `{{sender_name}} has requested you to sign {{document_title}}`;
  const defaultRequestBody = `<p>Hi {{receiver_name}},</p><br><p>We hope this email finds you well. {{sender_name}}&nbsp;has requested you to review and sign&nbsp;{{document_title}}.</p><p>Your signature is crucial to proceed with the next steps as it signifies your agreement and authorization.</p><br><p><a href='{{signing_url}}' rel='noopener noreferrer' target='_blank'>Sign here</a></p><br><br><p>If you have any questions or need further clarification regarding the document or the signing process, please contact the sender.</p><br><p>Thanks</p><p> Team ${appName}</p><br>`;
  const defaultCompletionSubject = `Document {{document_title}} has been signed by all parties`;
  const defaultCompletionBody = `<p>Hi {{sender_name}},</p><br><p>All parties have successfully signed the document {{document_title}}. Kindly download the document from the attachment.</p><br><p>Thanks</p><p> Team ${appName}</p><br>`;
  const cloudfunction =
        "updatetenant";

  useEffect(() => {
    fetchSubscription();
    fetchGlobalBrandingConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    info
  ]);

  const handleModifyMail = (mode) => {
    mode === "request"
      ? setIsDefaultMail((p) => ({ ...p, requestMail: !p?.requestMail }))
      : setIsDefaultMail((p) => ({ ...p, completionMail: !p?.completionMail }));
  };
  const fetchSubscription = async () => {
      await tenantEmailTemplate(info);
  };

  const fetchGlobalBrandingConfig = withSessionValidation(async () => {
    setIsBrandingLoader(true);
    try {
      const brandingRes = await Parse.Cloud.run("getglobalemailbranding");
      if (brandingRes) {
        const parsed = JSON.parse(JSON.stringify(brandingRes));
        setBrandingConfig({
          logoUrl: parsed?.logoUrl || "",
          primaryColor: parsed?.primaryColor || "#47a3ad",
          footerText: parsed?.footerText || "",
          wrapperHtml: parsed?.wrapperHtml || ""
        });
      }
    } catch (err) {
      console.error("Error while fetching global email branding: ", err);
      setIsAlert({ type: "danger", msg: t("something-went-wrong-mssg") });
      setTimeout(() => setIsAlert({ type: "", msg: "" }), 1500);
    } finally {
      setIsBrandingLoader(false);
    }
  });

  const tenantEmailTemplate = async (tenantRes) => {
    if (tenantRes === "user does not exist!") {
      alert(t("user-not-exist"));
    } else if (tenantRes) {
      const updateRes = tenantRes;
      const defaultRequestBody = `<p>Hi {{receiver_name}},</p><br><p>We hope this email finds you well. {{sender_name}}&nbsp;has requested you to review and sign&nbsp;{{document_title}}.</p><p>Your signature is crucial to proceed with the next steps as it signifies your agreement and authorization.</p><br><p><a href='{{signing_url}}' rel='noopener noreferrer' target='_blank'>Sign here</a></p><br><br><p>If you have any questions or need further clarification regarding the document or the signing process, please contact the sender.</p><br><p>Thanks</p><p> Team ${appName}</p><br>`;
      if (updateRes?.RequestBody) {
        setRequestBody(updateRes?.RequestBody);
        setRequestSubject(updateRes?.RequestSubject);
        setIsDefaultMail((prev) => ({ ...prev, requestMail: false }));
      } else {
        setRequestBody(defaultRequestBody);
        setRequestSubject(defaultRequestSubject);
        setIsDefaultMail((prev) => ({ ...prev, requestMail: true }));
      }
      if (updateRes?.CompletionBody) {
        setCompletionBody(updateRes?.CompletionBody);
        setCompletionSubject(updateRes?.CompletionSubject);
        setIsDefaultMail((prev) => ({ ...prev, completionMail: false }));
      } else {
        setCompletionBody(defaultCompletionBody);
        setCompletionSubject(defaultCompletionSubject);
        setIsDefaultMail((prev) => ({ ...prev, completionMail: true }));
      }
    }
  };
  //function to save completion email template
  const handleSaveCompletionEmail = withSessionValidation(async (e) => {
    e.preventDefault();
    try {
      const replacedHtmlBody = completionBody.replace(/"/g, "'");
      const htmlBody = `<html><head><meta http-equiv='Content-Type' content='text/html; charset=UTF-8' /></head><body>${replacedHtmlBody}</body></html>`;
      const updateTenant = await Parse.Cloud.run(cloudfunction, {
        tenantId: tenantId,
        details: {
          CompletionBody: htmlBody,
          CompletionSubject: completionSubject
        }
      });
      if (updateTenant) {
        const updateRes = JSON.parse(JSON.stringify(updateTenant));
        setCompletionBody(updateRes?.CompletionBody);
        setCompletionSubject(updateRes?.CompletionSubject);
        setIsAlert({ type: "success", msg: t("saved-successfully") });
        setTimeout(() => setIsAlert({ type: "", msg: "" }), 1500);
      }
    } catch (err) {
      console.error("Error while saving completion email template: ", err);
      setIsAlert({ type: "danger", msg: t("something-went-wrong-mssg") });
      setTimeout(() => setIsAlert({ type: "", msg: "" }), 1500);
    }
  });
  //function to save request email template
  const handleSaveRequestEmail = withSessionValidation(async (e) => {
    e.preventDefault();
    try {
      const replacedHtmlBody = requestBody.replace(/"/g, "'");
      const htmlBody = `<html><head><meta http-equiv='Content-Type' content='text/html; charset=UTF-8' /></head><body>${replacedHtmlBody}</body></html>`;
      const updateTenant = await Parse.Cloud.run(cloudfunction, {
        tenantId: tenantId,
        details: { RequestBody: htmlBody, RequestSubject: requestSubject }
      });
      if (updateTenant) {
        const updateRes = JSON.parse(JSON.stringify(updateTenant));
        setRequestBody(updateRes?.RequestBody);
        setRequestSubject(updateRes?.RequestSubject);
        let extUser =
          localStorage.getItem("Extand_Class") &&
          JSON.parse(localStorage.getItem("Extand_Class"))?.[0];
        if (extUser && extUser?.objectId) {
            extUser.TenantId.RequestBody = updateRes?.RequestBody;
            extUser.TenantId.RequestSubject = updateRes?.RequestSubject;
          const _extUser = JSON.parse(JSON.stringify(extUser));
          localStorage.setItem("Extand_Class", JSON.stringify([_extUser]));
        }
        setIsAlert({ type: "success", msg: t("saved-successfully") });
        setTimeout(() => setIsAlert({ type: "", msg: "" }), 1500);
      }
    } catch (err) {
      console.error("Error while saving request email template: ", err);
      setIsAlert({ type: "danger", msg: t("something-went-wrong-mssg") });
      setTimeout(() => setIsAlert({ type: "", msg: "" }), 1500);
    }
  });

  //function to use reset form
  const handleReset = withSessionValidation(async (request, completion) => {
    let extUser =
      localStorage.getItem("Extand_Class") &&
      JSON.parse(localStorage.getItem("Extand_Class"))?.[0];
    handleModifyMail(request);
    if (request && !isDefaultMail?.requestMail) {
      setRequestBody(defaultRequestBody);
      setRequestSubject(defaultRequestSubject);
      setIsMailLoader((p) => ({ ...p, request: true }));
      try {
        await Parse.Cloud.run(cloudfunction, {
          tenantId: tenantId,
          details: { RequestBody: "", RequestSubject: "" }
        });

        if (extUser && extUser?.objectId) {
            extUser.TenantId.RequestBody = "";
            extUser.TenantId.RequestSubject = "";
          const _extUser = JSON.parse(JSON.stringify(extUser));
          localStorage.setItem("Extand_Class", JSON.stringify([_extUser]));
        }
      } catch (err) {
        console.error("Error while resetting request mail: ", err);
      } finally {
        setIsMailLoader((p) => ({ ...p, request: false }));
      }
    } else if (completion && !isDefaultMail?.completionMail) {
      setCompletionSubject(defaultCompletionSubject);
      setCompletionBody(defaultCompletionBody);
      setIsMailLoader((p) => ({ ...p, completion: true }));
      try {
        await Parse.Cloud.run(cloudfunction, {
          tenantId: tenantId,
          details: { CompletionBody: "", CompletionSubject: "" }
        });
        if (extUser && extUser?.objectId) {
            extUser.TenantId.CompletionBody = "";
            extUser.TenantId.CompletionSubject = "";
          const _extUser = JSON.parse(JSON.stringify(extUser));
          localStorage.setItem("Extand_Class", JSON.stringify([_extUser]));
        }
      } catch (err) {
        console.error("Error while resetting completion mail: ", err);
      } finally {
        setIsMailLoader((p) => ({ ...p, completion: false }));
      }
    }
  });
  //function for handle ontext change and save again text in delta
  const handleOnchangeRequest = (html) => {
    if (html) {
      setRequestBody(html);
    }
  };
  const handleOnchangeCompletion = (html) => {
    if (html) {
      setCompletionBody(html);
    }
  };
  const handleBrandingInput = (field, value) => {
    setBrandingConfig((prev) => ({ ...prev, [field]: value }));
  };

  const applyBrandingPreview = () => {
    const wrapper = brandingConfig?.wrapperHtml || "";
    if (!wrapper) {
      return "";
    }
    return wrapper
      .replaceAll("__APP_NAME__", appName)
      .replaceAll("__LOGO_URL__", brandingConfig?.logoUrl || "")
      .replaceAll("__PRIMARY_COLOR__", brandingConfig?.primaryColor || "#47a3ad")
      .replaceAll("__HEADER_TEXT__", brandingConfig?.headerText || "Digital Signature Request")
      .replaceAll(
        "__FOOTER_TEXT__",
        brandingConfig?.footerText || `This is an automated email from ${appName}.`
      )
      .replaceAll(
        "__EMAIL_BODY__",
        "<p>Hello, this is a preview of your branded email wrapper.</p><p>The request/completion content will be injected here.</p>"
      );
  };

  const handleSaveBrandingConfig = withSessionValidation(async (e) => {
    e.preventDefault();
    setIsBrandingLoader(true);
    try {
      const updateRes = await Parse.Cloud.run("updateglobalemailbranding", {
        details: {
          logoUrl: brandingConfig?.logoUrl || "",
          primaryColor: brandingConfig?.primaryColor || "#47a3ad",
          footerText: brandingConfig?.footerText || "",
          wrapperHtml: brandingConfig?.wrapperHtml || ""
        }
      });
      if (updateRes) {
        setIsAlert({ type: "success", msg: t("saved-successfully") });
        setTimeout(() => setIsAlert({ type: "", msg: "" }), 1500);
      }
    } catch (err) {
      console.error("Error while saving global email branding: ", err);
      setIsAlert({ type: "danger", msg: t("something-went-wrong-mssg") });
      setTimeout(() => setIsAlert({ type: "", msg: "" }), 1500);
    } finally {
      setIsBrandingLoader(false);
    }
  });
  return (
    <>
      {isalert.msg && <Alert type={isalert.type}>{isalert.msg}</Alert>}
      <div className="flex flex-col mb-4">
        <div className="flex flex-col">
          <h1 className="text-[14px] mb-[0.7rem] font-medium">
            {t("request-email")}
          </h1>
          <div className="relative mt-2 mb-4">
            {isMailLoader.request && (
              <div className="flex z-[100] justify-center items-center absolute w-full h-full rounded-box bg-black/30">
                <Loader />
              </div>
            )}
            {
                isDefaultMail?.requestMail && (
                  <div className="absolute backdrop-blur-[2px] flex w-full h-full justify-center items-center bg-black/10 rounded-box select-none z-20">
                    <button
                      onClick={() => handleModifyMail("request")}
                      className="op-btn op-btn-primary shadow-lg"
                    >
                      {t("modify")}
                    </button>
                  </div>
                )
            }
            <form
              onSubmit={handleSaveRequestEmail}
              className="p-3 border-[1px] border-base-content rounded-box"
            >
              <div className="text-lg font-normal">
                <label className="text-sm">
                  {t("subject")}{" "}
                  <Tooltip
                    id={"request-sub-tooltip"}
                    message={`${t("variables-use")}: {{sender_name}} {{document_title}}`}
                  />
                </label>
                <input
                  required
                  value={requestSubject}
                  onChange={(e) => setRequestSubject(e.target.value)}
                  placeholder={`{{sender_name}} ${t("send-to-sign")} {{document_title}}`}
                  className="w-full op-input op-input-bordered op-input-sm focus:outline-none hover:border-base-content text-xs"
                />
              </div>
              <div className="text-lg font-normal py-2">
                <label className="text-sm mt-3">
                  {t("body")}{" "}
                  <Tooltip
                    id={"request-body-tooltip"}
                    message={`${t("variables-use")}: {{sender_name}} {{document_title}}`}
                  />
                </label>
                <EditorToolbar containerId="toolbar1" />
                <ReactQuill
                  theme="snow"
                  value={requestBody}
                  placeholder="add body of email"
                  modules={module1}
                  formats={formats}
                  onChange={(value) => handleOnchangeRequest(value)}
                />
              </div>
              <div className="flex items-center mt-3 gap-2">
                <button
                  disabled={!requestBody || !requestSubject}
                  className="op-btn op-btn-primary"
                  type="submit"
                >
                  {t("save")}
                </button>
                <button
                  type="button"
                  className="op-btn op-btn-secondary"
                  onClick={() => handleReset("request")}
                >
                  {t("reset")}
                </button>
              </div>
            </form>
          </div>
          <h1 className="text-[14px] mb-[0.7rem] font-medium">
            {t("completion-email")}
          </h1>
          <div className="relative my-2">
            {isMailLoader.completion && (
              <div className="flex z-[100] justify-center items-center absolute w-full h-full rounded-box bg-black/30">
                <Loader />
              </div>
            )}
            {
                isDefaultMail?.completionMail && (
                  <div className="absolute backdrop-blur-[2px] flex w-full h-full justify-center items-center bg-black/10 rounded-box select-none z-20">
                    <button
                      onClick={() => handleModifyMail("completion")}
                      className="op-btn op-btn-primary shadow-lg"
                    >
                      {t("modify")}
                    </button>
                  </div>
                )
            }
            <form
              onSubmit={handleSaveCompletionEmail}
              className="p-3 border-[1px] border-base-content rounded-box"
            >
              <div className="text-lg font-normal">
                <label className="text-sm">
                  {t("subject")}{" "}
                  <Tooltip
                    id={"complete-sub-tooltip"}
                    message={`${t("variables-use")}:{{sender_name}} {{document_title}}`}
                  />
                </label>
                <input
                  required
                  value={completionSubject}
                  onChange={(e) => setCompletionSubject(e.target.value)}
                  placeholder={`{{sender_name}}  ${t("send-to-sign")} {{document_title}}`}
                  className="w-full op-input op-input-bordered op-input-sm focus:outline-none hover:border-base-content text-xs"
                />
              </div>
              <div className="text-lg font-normal py-2">
                <label className="text-sm mt-3">
                  {t("body")}{" "}
                  <Tooltip
                    id={"complete-body-tooltip"}
                    message={`${t("variables-use")}:{{sender_name}} {{document_title}} {{signing_url}}`}
                  />
                </label>
                <EditorToolbar containerId="toolbar2" />
                <ReactQuill
                  theme="snow"
                  value={completionBody}
                  placeholder="add body of email"
                  modules={module2}
                  formats={formats}
                  onChange={(value) => handleOnchangeCompletion(value)}
                />
              </div>
              <div className="flex items-center mt-3 gap-2">
                <button
                  disabled={!completionBody || !completionSubject}
                  className="op-btn op-btn-primary"
                  type="submit"
                >
                  {t("save")}
                </button>
                <button
                  type="button"
                  className="op-btn op-btn-secondary"
                  onClick={() => handleReset(null, "completion")}
                >
                  {t("reset")}
                </button>
              </div>
            </form>
          </div>
          <h1 className="text-[14px] mt-5 mb-[0.7rem] font-medium">
            Global Email Branding
          </h1>
          <div className="relative my-2">
            {isBrandingLoader && (
              <div className="flex z-[100] justify-center items-center absolute w-full h-full rounded-box bg-black/30">
                <Loader />
              </div>
            )}
            <form
              onSubmit={handleSaveBrandingConfig}
              className="p-3 border-[1px] border-base-content rounded-box"
            >
              <p className="text-xs text-base-content/70 mb-3">
                Applies globally to request and completion emails.
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Logo URL</label>
                  <input
                    type="url"
                    value={brandingConfig.logoUrl}
                    onChange={(e) => handleBrandingInput("logoUrl", e.target.value)}
                    className="w-full op-input op-input-bordered op-input-sm focus:outline-none hover:border-base-content text-xs"
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div>
                  <label className="text-sm">Primary Color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={brandingConfig.primaryColor || "#47a3ad"}
                      onChange={(e) => handleBrandingInput("primaryColor", e.target.value)}
                      className="op-input op-input-bordered op-input-sm h-[34px] w-[52px] p-1"
                    />
                    <input
                      type="text"
                      value={brandingConfig.primaryColor}
                      onChange={(e) => handleBrandingInput("primaryColor", e.target.value)}
                      className="w-full op-input op-input-bordered op-input-sm focus:outline-none hover:border-base-content text-xs"
                      placeholder="#47a3ad"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <label className="text-sm">Footer Text</label>
                <textarea
                  value={brandingConfig.footerText}
                  onChange={(e) => handleBrandingInput("footerText", e.target.value)}
                  className="w-full op-textarea op-textarea-bordered focus:outline-none hover:border-base-content text-xs"
                  rows={3}
                  placeholder={`This is an automated email from ${appName}.`}
                />
              </div>
              <div className="mt-3">
                <label className="text-sm">
                  Full Wrapper HTML (use tokens: __APP_NAME__, __LOGO_URL__, __PRIMARY_COLOR__, __FOOTER_TEXT__, __EMAIL_BODY__)
                </label>
                <textarea
                  value={brandingConfig.wrapperHtml}
                  onChange={(e) => handleBrandingInput("wrapperHtml", e.target.value)}
                  className="w-full op-textarea op-textarea-bordered focus:outline-none hover:border-base-content text-xs font-mono"
                  rows={10}
                />
              </div>
              <div className="flex items-center mt-3 gap-2">
                <button
                  disabled={!brandingConfig.wrapperHtml}
                  className="op-btn op-btn-primary"
                  type="submit"
                >
                  {t("save")}
                </button>
                <button
                  type="button"
                  className="op-btn op-btn-secondary"
                  onClick={fetchGlobalBrandingConfig}
                >
                  Reload
                </button>
              </div>
              <div className="mt-4">
                <h2 className="text-sm font-medium mb-2">Preview</h2>
                <div
                  className="border border-base-content/20 rounded-box p-2 bg-base-200 overflow-auto"
                  dangerouslySetInnerHTML={{ __html: applyBrandingPreview() }}
                />
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};
export default MailTemplateEditor;
