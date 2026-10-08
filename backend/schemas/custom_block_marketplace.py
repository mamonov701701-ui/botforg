from datetime import datetime
from typing import Any
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, model_validator


MARKETPLACE_CATEGORIES = {"ecommerce", "support", "automation", "marketing", "other"}


class ListingPayload(BaseModel):
    commercial_mode: str = "free"
    price_amount: Decimal | None = None
    price_currency: str | None = None
    title: str | None = Field(default=None, max_length=160)
    description: str | None = None
    category: str = Field(default="other", max_length=64)
    tags: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("commercial_mode")
    @classmethod
    def valid_commercial_mode(cls, value: str) -> str:
        if value not in {"free", "paid"}:
            raise ValueError("Недопустимый commercial mode")
        return value

    @model_validator(mode="after")
    def price_for_paid(self):
        if self.commercial_mode == "paid":
            if self.price_amount is None or self.price_amount <= 0 or self.price_amount.as_tuple().exponent < -2:
                raise ValueError("Для платного размещения укажите фиксированную цену с точностью до копеек")
            if not self.price_currency or len(self.price_currency) != 3 or not self.price_currency.isalpha() or self.price_currency != self.price_currency.upper():
                raise ValueError("Для платного размещения укажите код валюты ISO 4217")
        elif self.price_amount is not None or self.price_currency is not None:
            raise ValueError("У бесплатного размещения не должно быть цены")
        return self

    @field_validator("category")
    @classmethod
    def valid_category(cls, value: str) -> str:
        if value not in MARKETPLACE_CATEGORIES:
            raise ValueError("Недопустимая категория Marketplace")
        return value


class AccessRequestPayload(BaseModel):
    message: str = Field(default="", max_length=4000)


class DecisionPayload(BaseModel):
    note: str = Field(default="", max_length=4000)


class ExplicitGrantPayload(BaseModel):
    recipient_user_id: int | None = Field(default=None, gt=0)
    recipient_public_id: int | None = Field(default=None, gt=0)
    note: str = Field(default="", max_length=4000)

    @model_validator(mode="after")
    def one_recipient(self):
        if (self.recipient_user_id is None) == (self.recipient_public_id is None):
            raise ValueError("Укажите ровно один идентификатор пользователя")
        return self


class ReviewPayload(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=4000)
