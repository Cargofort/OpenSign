import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Parse from "parse";
import Tooltip from "../../primitives/Tooltip";
import Alert from "../../primitives/Alert";
import Loader from "../../primitives/Loader";
import { withSessionValidation } from "../../utils";
import { useDispatch } from "react-redux";
import { setTenantInfo, setUserInfo } from "../../redux/reducers/userReducer";
import EmailEditor from "../emaileditor";

const MailTemplateEditor = ({
  info,
  tenantId,
}) => {
  const appName =
    "OpenSign™";
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [requestBody, setRequestBody] = useState({ basic: "", advanced: "" });
  const [requestSubject, setRequestSubject] = useState("");
  const [completionBody, setCompletionBody] = useState({
    basic: "",
    advanced: ""
  });
  const [completionSubject, setCompletionSubject] = useState("");
  const [isTemplateLoaded, setIsTemplateLoaded] = useState(false);
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
  const [editorType, setEditorType] = useState({
    request: "basic",
    completion: "basic"
  });
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
        setRequestBody((p) => ({
          ...p,
          basic: updateRes?.RequestBody,
          advanced: updateRes?.RequestBody
        }));
        setRequestSubject(updateRes?.RequestSubject);
        setIsDefaultMail((prev) => ({ ...prev, requestMail: false }));
      } else {
        setRequestBody((p) => ({
          ...p,
          basic: defaultRequestBody,
          advanced: defaultRequestBody
        }));
        setRequestSubject(defaultRequestSubject);
        setIsDefaultMail((prev) => ({ ...prev, requestMail: true }));
      }
      if (updateRes?.CompletionBody) {
        setCompletionBody((p) => ({
          ...p,
          basic: updateRes?.CompletionBody,
          advanced: updateRes?.CompletionBody
        }));
        setCompletionSubject(updateRes?.CompletionSubject);
        setIsDefaultMail((prev) => ({ ...prev, completionMail: false }));
      } else {
        setCompletionBody((p) => ({
          ...p,
          basic: defaultCompletionBody,
          advanced: defaultCompletionBody
        }));
        setCompletionSubject(defaultCompletionSubject);
        setIsDefaultMail((prev) => ({ ...prev, completionMail: true }));
      }
      setEditorType((p) => ({
        ...p,
        request: updateRes?.EmailEditorType?.request || "basic",
        completion: updateRes?.EmailEditorType?.completion || "basic"
      }));
      setIsTemplateLoaded((prev) => !prev);
    }
  };

  const updateValuesInRedux = (subject, body, response) => {
    const action =
          setTenantInfo;
    const updatedInfo = { ...info };
    updatedInfo[subject] = response?.[subject] ?? "";
    updatedInfo[body] = response?.[body] ?? "";
    updatedInfo.EmailEditorType = response?.EmailEditorType;
    dispatch(action(updatedInfo));
  };
  //function to save completion email template
  const handleSaveCompletionEmail = withSessionValidation(async (e) => {
    e.preventDefault();
    try {
      const replacedHtmlBody = completionBody[editorType.completion]?.replace(
        /"/g,
        "'"
      );
      const htmlBody = `<html><head><meta http-equiv='Content-Type' content='text/html; charset=UTF-8' /></head><body>${replacedHtmlBody}</body></html>`;
      const updateTenant = await Parse.Cloud.run(cloudfunction, {
        tenantId: tenantId,
        details: {
          CompletionBody: htmlBody,
          CompletionSubject: completionSubject,
          EmailEditorType: editorType
        }
      });
      if (updateTenant) {
        const updateRes = JSON.parse(JSON.stringify(updateTenant));
        setCompletionBody((p) => ({
          ...p,
          basic: updateRes?.CompletionBody,
          advanced: updateRes?.CompletionBody
        }));
        setCompletionSubject(updateRes?.CompletionSubject);
        setEditorType(updateRes?.EmailEditorType);
        updateValuesInRedux("CompletionSubject", "CompletionBody", updateRes);
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
      const replacedHtmlBody = requestBody[editorType.request]?.replace(
        /"/g,
        "'"
      );

      const htmlBody = `<html><head><meta http-equiv='Content-Type' content='text/html; charset=UTF-8' /></head><body>${replacedHtmlBody}</body></html>`;
      const updateTenant = await Parse.Cloud.run(cloudfunction, {
        tenantId: tenantId,
        details: {
          RequestBody: htmlBody,
          RequestSubject: requestSubject,
          EmailEditorType: editorType
        }
      });
      if (updateTenant) {
        const updateRes = JSON.parse(JSON.stringify(updateTenant));
        setRequestBody((p) => ({
          ...p,
          basic: updateRes?.RequestBody,
          advanced: updateRes?.RequestBody
        }));
        setRequestSubject(updateRes?.RequestSubject);
        setEditorType(updateRes?.EmailEditorType);
        let extUser =
          localStorage.getItem("Extand_Class") &&
          JSON.parse(localStorage.getItem("Extand_Class"))?.[0];
        if (extUser && extUser?.objectId) {
            extUser.TenantId.RequestBody = updateRes?.RequestBody;
            extUser.TenantId.RequestSubject = updateRes?.RequestSubject;
            extUser.TenantId.EmailEditorType = updateRes?.EmailEditorType;
          const _extUser = JSON.parse(JSON.stringify(extUser));
          localStorage.setItem("Extand_Class", JSON.stringify([_extUser]));
        }
        updateValuesInRedux("RequestSubject", "RequestBody", updateRes);
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
      const emailEditor = {
        request: "basic",
        completion: editorType.completion
      };
      setRequestBody((p) => ({
        ...p,
        basic: defaultRequestBody,
        advanced: defaultRequestBody
      }));
      setEditorType((p) => ({ ...p, request: "basic" }));
      setRequestSubject(defaultRequestSubject);
      setIsMailLoader((p) => ({ ...p, request: true }));
      try {
        await Parse.Cloud.run(cloudfunction, {
          tenantId: tenantId,
          details: {
            RequestBody: "",
            RequestSubject: "",
            EmailEditorType: emailEditor
          }
        });

        if (extUser && extUser?.objectId) {
            extUser.TenantId.RequestBody = "";
            extUser.TenantId.RequestSubject = "";
            extUser.TenantId.EmailEditorType = emailEditor;
          const _extUser = JSON.parse(JSON.stringify(extUser));
          localStorage.setItem("Extand_Class", JSON.stringify([_extUser]));
          dispatch(
            setUserInfo({
              ...info,
              RequestSubject: "",
              RequestBody: "",
              EmailEditorType: emailEditor
            })
          );
        }
      } catch (err) {
        console.error("Error while resetting request mail: ", err);
      } finally {
        setIsMailLoader((p) => ({ ...p, request: false }));
      }
    } else if (completion && !isDefaultMail?.completionMail) {
      const emailEditor = { request: editorType.request, completion: "basic" };
      setCompletionSubject(defaultCompletionSubject);
      setCompletionBody((p) => ({
        ...p,
        basic: defaultCompletionBody,
        advanced: defaultCompletionBody
      }));
      setEditorType((p) => ({ ...p, completion: "basic" }));
      setIsMailLoader((p) => ({ ...p, completion: true }));
      try {
        await Parse.Cloud.run(cloudfunction, {
          tenantId: tenantId,
          details: {
            CompletionBody: "",
            CompletionSubject: "",
            EmailEditorType: emailEditor
          }
        });
        if (extUser && extUser?.objectId) {
            extUser.TenantId.CompletionBody = "";
            extUser.TenantId.CompletionSubject = "";
            extUser.TenantId.EmailEditorType = emailEditor;
          const _extUser = JSON.parse(JSON.stringify(extUser));
          localStorage.setItem("Extand_Class", JSON.stringify([_extUser]));
          dispatch(
            setUserInfo({
              ...info,
              CompletionSubject: "",
              CompletionBody: "",
              EmailEditorType: emailEditor
            })
          );
        }
      } catch (err) {
        console.error("Error while resetting completion mail: ", err);
      } finally {
        setIsMailLoader((p) => ({ ...p, completion: false }));
      }
    }
  });
  //function for handle ontext change and save again text in delta
  const handleOnchangeRequest = (newValue, changedType) => {
    setRequestBody((prev) => ({ ...prev, [changedType]: newValue }));
  };

  const handleOnchangeCompletion = (newValue, changedType) => {
    setCompletionBody((prev) => ({ ...prev, [changedType]: newValue }));
  };

  const handleSwitch = (e, flow) => {
    e.preventDefault();
    e.stopPropagation();
    const editor = editorType[flow] === "basic" ? "advanced" : "basic";
    setEditorType((p) => ({ ...p, [flow]: editor }));
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
                    message={`${t("variables-use")}: {{document_title}} {{sender_name}}, {{sender_mail}}, {{sender_phone}}, {{receiver_name}}, {{receiver_email}}, {{receiver_phone}}, {{expiry_date}}, {{company_name}}, {{signing_url}}, {{note}}`}
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
                <label className="flex justify-between text-sm mt-3">
                  <span>
                    {t("body")}{" "}
                    <Tooltip
                      id={"request-body-tooltip"}
                      message={`${t("variables-use")}: {{document_title}} {{sender_name}}, {{sender_mail}}, {{sender_phone}}, {{receiver_name}}, {{receiver_email}}, {{receiver_phone}}, {{expiry_date}}, {{company_name}}, {{signing_url}}, {{note}}`}
                    />
                  </span>
                  <button
                    className="op-link op-link-primary"
                    onClick={(e) => handleSwitch(e, "request")}
                  >
                    {editorType.request === "basic"
                      ? t("switch-to-advanced")
                      : t("switch-to-basic")}
                  </button>
                </label>
                <EmailEditor
                  type={editorType.request}
                  values={requestBody}
                  onChange={handleOnchangeRequest}
                  bodyName="request"
                  isReset={isMailLoader?.request}
                  isTemplateLoaded={isTemplateLoaded}
                />
              </div>
              <div className="flex items-center mt-3 gap-2">
                <button
                  disabled={!requestBody[editorType.request] || !requestSubject}
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
                    message={`${t("variables-use")}: {{document_title}} {{sender_name}}, {{sender_mail}}, {{sender_phone}}, {{receiver_name}}, {{receiver_email}}, {{receiver_phone}}, {{company_name}}, {{signing_url}}, {{note}}`}
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
                <label className="flex justify-between text-sm mt-3">
                  <span>
                    {t("body")}{" "}
                    <Tooltip
                      id={"complete-body-tooltip"}
                      message={`${t("variables-use")}: {{document_title}} {{sender_name}}, {{sender_mail}}, {{sender_phone}}, {{receiver_name}}, {{receiver_email}}, {{receiver_phone}}, {{company_name}}, {{signing_url}}, {{note}}`}
                    />
                  </span>
                  <button
                    className="op-link op-link-primary"
                    onClick={(e) => handleSwitch(e, "completion")}
                  >
                    {editorType.completion === "basic"
                      ? t("switch-to-advanced")
                      : t("switch-to-basic")}
                  </button>
                </label>
                <EmailEditor
                  type={editorType.completion}
                  values={completionBody}
                  onChange={handleOnchangeCompletion}
                  bodyName="completion"
                  isReset={isMailLoader?.completion}
                  isTemplateLoaded={isTemplateLoaded}
                />
              </div>
              <div className="flex items-center mt-3 gap-2">
                <button
                  disabled={
                    !completionBody[editorType.completion] || !completionSubject
                  }
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
