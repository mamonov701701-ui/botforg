from backend.models.ai_provider import AiModelCatalog, AiProviderConfig
class AiRouteError(Exception): pass
def select_route(db, *, capability, feature, require_structured=False):
    rows=db.query(AiModelCatalog, AiProviderConfig).join(AiProviderConfig, AiModelCatalog.provider_id==AiProviderConfig.id).filter(AiProviderConfig.enabled.is_(True), AiModelCatalog.enabled.is_(True), AiModelCatalog.deprecated.is_(False)).all()
    choices=[]
    for model, provider in rows:
        if capability not in (model.capabilities or []): continue
        if model.feature_allow_list and feature not in model.feature_allow_list: continue
        if require_structured and not model.structured_output_supported: continue
        choices.append((model, provider))
    if not choices: raise AiRouteError("no_eligible_model")
    return min(choices, key=lambda row:(row[0].routing_priority, row[1].routing_priority, row[0].id))
