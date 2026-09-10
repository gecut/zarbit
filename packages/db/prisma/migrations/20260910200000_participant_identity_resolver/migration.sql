-- A canonical bot order may substantiate one human action at most.
CREATE UNIQUE INDEX "TradingAction_chatId_confirmedByMessageId_key"
ON "TradingAction"("chatId", "confirmedByMessageId");
