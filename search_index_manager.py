from typing import Optional

from azure.core.credentials_async import AsyncTokenCredential
from azure.search.documents.aio import SearchClient
from azure.search.documents.indexes.aio import SearchIndexClient
from azure.search.documents.models import VectorizedQuery
from azure.search.documents.indexes.models import (
    SearchField,
    SearchFieldDataType,
    SimpleField,
    SearchIndex,
    VectorSearch,
    VectorSearchProfile,
    HnswAlgorithmConfiguration)
from openai import AsyncAzureOpenAI
from azure.core.exceptions import ResourceNotFoundError, HttpResponseError


class SearchIndexManager:
    """
    Manager de recherche adapté SUR MESURE pour l'index de Subul.
    """

    def __init__(
            self,
            endpoint: str,
            credential: AsyncTokenCredential,
            index_name: str,
            dimensions: Optional[int],
            model: str,
            embeddings_client: AsyncAzureOpenAI,
        ) -> None:
        self._dimensions = dimensions
        self._index_name = index_name
        self._embeddings_client = embeddings_client
        self._endpoint = endpoint
        self._credential = credential
        self._index = None
        self._model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = SearchClient(
                endpoint=self._endpoint, index_name=self._index_name, credential=self._credential)
        return self._client

    async def search(self, message: str, top_k: int = 5, cloud_filter: str | None = None) -> str:
        """
        Recherche sémantique + vectorielle adaptée à l'index avec audit de performance.
        Retourne les résultats formatés comme une chaîne de texte.
        """
        import time
        t_start = time.time()

        response = await self._embeddings_client.embeddings.create(
            input=message,
            model=self._model
        )
        embedded_question = response.data[0].embedding

        t_embed = time.time()
        print(f"      -> [Search] 🟢 Embedding généré en {t_embed - t_start:.2f} secondes")

        vector_query = VectorizedQuery(vector=embedded_question, k=top_k * 2, fields="vecteur")
        filtre = f"cloud_provider eq '{cloud_filter.upper()}'" if cloud_filter else None

        response_search = await self._get_client().search(
            vector_queries=[vector_query],
            filter=filtre,
            select=['texte', 'source_file', 'cloud_provider'],
        )

        results = []
        async for result in response_search:
            source = result.get('source_file', 'Inconnu')
            texte = result.get('texte', '')
            results.append(f"[Source: {source}]\n{texte}")

        t_db = time.time()
        print(f"      -> [Search] 🔵 Azure Search a répondu en {t_db - t_embed:.2f} secondes")

        return "\n------\n".join(results)

    async def search_structured(self, message: str, top_k: int = 5, cloud_filter: str | None = None) -> list[dict]:
        """
        Recherche sémantique + vectorielle qui retourne une liste de dicts structurés.
        Utilisée par le QuizAgent pour la génération de quiz.
        """
        import time
        t_start = time.time()

        response = await self._embeddings_client.embeddings.create(
            input=message,
            model=self._model
        )
        embedded_question = response.data[0].embedding

        t_embed = time.time()
        print(f"      -> [Search Roadmap] 🟢 Embedding généré en {t_embed - t_start:.2f} secondes")

        vector_query = VectorizedQuery(vector=embedded_question, k=top_k * 2, fields="vecteur")
        filtre = f"cloud_provider eq '{cloud_filter.upper()}'" if cloud_filter else None

        response_search = await self._get_client().search(
            vector_queries=[vector_query],
            filter=filtre,
            select=['id', 'cloud_provider', 'source_file', 'texte'],
            top=top_k,
        )

        results = []
        async for result in response_search:
            results.append({
                "cloud":  result.get("cloud_provider"),
                "source": result.get("source_file"),
                "texte":  result.get("texte"),
            })

        t_db = time.time()
        print(f"      -> [Search Roadmap] 🔵 Azure Search a répondu en {t_db - t_embed:.2f} secondes")

        return results

    async def ensure_index_created(self, vector_index_dimensions: Optional[int] = None) -> None:
        """
        Vérifie que l'index existe.
        """
        async with SearchIndexClient(endpoint=self._endpoint, credential=self._credential) as ix_client:
            try:
                await ix_client.get_index(self._index_name)
                print(f"✅ [Index Manager Roadmap] Index '{self._index_name}' trouvé et connecté.")
            except ResourceNotFoundError:
                print(f"⚠️ [Index Manager Roadmap] Index '{self._index_name}' introuvable ! Lance d'abord l'indexeur.")

    async def close(self):
        """Ferme les connexions."""
        if self._client:
            await self._client.close()
